import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/auth-context';
import { apiRequest } from '../services/api';
import { allPages } from '../services/portal';
import { DATA_CHANGED, LIVE_REFRESH } from '../services/live-events';
import { activitySources, buildActivity, type ActivityData, type ActivityRole, type ActivityRow } from '../utils/activity';
import { ActivityContext } from './context';
import { AUTH_TOKEN_KEY } from '../data/booking';

function storedRead(key: string): string[] { try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(-128) : []; } catch { return []; } }
export function ActivityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? <ActivitySession key={`${user.id}:${user.role}`} userId={user.id} role={user.role}>{children}</ActivitySession> : children;
}
function ActivitySession({ children, userId, role }: { children: ReactNode; userId: string; role: ActivityRole }) {
  const storageKey = `wdp-activity-read:${userId}:${role}`;
  const [read, setRead] = useState(() => storedRead(storageKey));
  const [state, setState] = useState<{ data: ActivityData; checkedAt: number; failed: string[]; checking: boolean; changed: boolean }>({ data: {}, checkedAt: 0, failed: [], checking: true, changed: false });
  const trigger = useRef<() => void>(() => {});
  const refresh = useCallback(() => trigger.current(), []);
  const markRead = useCallback((tokens: string[]) => {
    setRead(previous => { const next = [...new Set([...previous, ...tokens])].slice(-128); return next; });
  }, []);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(read)); } catch { /* Read state remains available for this session. */ } }, [storageKey, read]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey) setRead(storedRead(storageKey)); };
    window.addEventListener('storage', onStorage); return () => window.removeEventListener('storage', onStorage);
  }, [storageKey]);
  useEffect(() => {
    const controller = new AbortController(), sources = activitySources(role);
    const sessionToken = localStorage.getItem(AUTH_TOKEN_KEY);
    const snapshot: ActivityData = {}; let running = false, initialized = false, queued = false, timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      if (controller.signal.aborted || document.visibilityState === 'hidden') return;
      if (!navigator.onLine) { setState(current => ({ ...current, checking: false, checkedAt: Date.now(), failed: ['Kết nối mạng'] })); return; }
      if (running) { queued = true; return; }
      running = true; setState(current => ({ ...current, checking: true }));
      const failed: string[] = [], changed: string[] = [];
      let index = 0;
      const worker = async () => { while (index < sources.length && !controller.signal.aborted) {
        const source = sources[index++];
        if (localStorage.getItem(AUTH_TOKEN_KEY) !== sessionToken) { controller.abort(); return; }
        try {
          const rows = source.array ? await apiRequest<ActivityRow[]>(source.path, { signal: controller.signal, expectedToken: sessionToken }) : (await allPages(source.path, controller.signal, sessionToken)).items;
          if (!Array.isArray(rows)) throw new Error('Danh sách không hợp lệ');
          if (initialized && JSON.stringify(snapshot[source.kind]) !== JSON.stringify(rows)) changed.push(source.path);
          snapshot[source.kind] = rows;
        } catch { if (!controller.signal.aborted) failed.push(source.title); }
      } };
      await Promise.all([worker(), worker(), worker()]);
      if (controller.signal.aborted) return;
      initialized = true; running = false;
      setState(current => ({ data: { ...snapshot }, checkedAt: Date.now(), failed, checking: false, changed: current.changed || changed.length > 0 }));
      if (changed.length) window.dispatchEvent(new CustomEvent(LIVE_REFRESH, { detail: changed }));
      if (queued) { queued = false; void load(); }
    };
    const schedule = () => { clearTimeout(timer); if (!controller.signal.aborted) timer = setTimeout(() => { void load().finally(schedule); }, 30000); };
    trigger.current = () => { void load(); };
    const resume = () => { if (document.visibilityState !== 'hidden') void load(); };
    const mutation = () => { clearTimeout(timer); timer = setTimeout(() => { void load().finally(schedule); }, 400); };
    const dirty = (event: Event) => { const target = event.target; if (target instanceof Element) { const form = target.closest('form'); if (form) { form.setAttribute('data-wdp-dirty', 'true'); form.setAttribute('data-wdp-edit-version', String(Number(form.getAttribute('data-wdp-edit-version') ?? 0) + 1)); } } };
    const submit = (event: Event) => { if (event.target instanceof HTMLFormElement) event.target.setAttribute('data-wdp-submitting', 'true'); };
    document.addEventListener('input', dirty, true); document.addEventListener('change', dirty, true); document.addEventListener('submit', submit, true);
    document.addEventListener('visibilitychange', resume); window.addEventListener('online', resume); window.addEventListener('offline', resume); window.addEventListener('focus', resume); window.addEventListener(DATA_CHANGED, mutation);
    void load().finally(schedule);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('input', dirty, true); document.removeEventListener('change', dirty, true); document.removeEventListener('submit', submit, true); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); window.removeEventListener('offline', resume); window.removeEventListener('focus', resume); window.removeEventListener(DATA_CHANGED, mutation); };
  }, [role]);
  return <ActivityContext.Provider value={{ data: state.data, entries: buildActivity(role, userId, state.data), read, loading: !state.checkedAt, checking: state.checking, checkedAt: state.checkedAt, failed: state.failed, changed: state.changed, refresh, markRead, acknowledge: () => setState(current => ({ ...current, changed: false })) }}>{children}</ActivityContext.Provider>;
}
