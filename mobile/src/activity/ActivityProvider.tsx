import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { apiAllPages, apiRequest } from '@/services/api';
import { refreshScreens, subscribeDataChanged } from '@/services/live-events';
import { activityHash, activitySources, buildActivity, type ActivityData, type ActivityRole, type ActivityRow } from '@/utils/activity';
import { ActivityContext } from './context';
import { activityStorage } from './read-storage';
import { authStorage } from '@/services/auth-storage';

export function ActivityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? <ActivitySession key={`${user.id}:${user.role}`} userId={user.id} role={user.role}>{children}</ActivitySession> : children;
}
function ActivitySession({ children, userId, role }: { children: ReactNode; userId: string; role: ActivityRole }) {
  const storageKey = `wdp.activity.${role}.${activityHash(userId)}`;
  const [read, setRead] = useState<string[]>([]), [readReady, setReadReady] = useState(false);
  const [state, setState] = useState<{ data: ActivityData; checkedAt: number; failed: string[]; checking: boolean; changed: boolean }>({ data: {}, checkedAt: 0, failed: [], checking: true, changed: false });
  const trigger = useRef<() => void>(() => {}), writeQueue = useRef(Promise.resolve());
  const refresh = useCallback(() => trigger.current(), []);
  const markRead = useCallback((tokens: string[]) => setRead(previous => [...new Set([...previous, ...tokens])].slice(-4096)), []);
  useEffect(() => {
    let active = true;
    activityStorage.get(storageKey).then(raw => {
      let stored: unknown = []; try { stored = JSON.parse(raw ?? '[]'); } catch { /* Ignore damaged read markers. */ }
      if (active && Array.isArray(stored)) setRead(previous => [...new Set([...stored.filter((value): value is string => typeof value === 'string'), ...previous])].slice(-4096));
    }).catch(() => {}).finally(() => { if (active) setReadReady(true); });
    return () => { active = false; };
  }, [storageKey]);
  useEffect(() => { if (readReady) writeQueue.current = writeQueue.current.catch(() => {}).then(() => activityStorage.set(storageKey, JSON.stringify(read))).catch(() => {}); }, [read, readReady, storageKey]);
  useEffect(() => {
    const controller = new AbortController(), sources = activitySources(role), snapshot: ActivityData = {};
    let running = false, initialized = false, queued = false, timer: ReturnType<typeof setTimeout>;
    const sessionToken = authStorage.getToken().catch(() => null);
    const load = async () => {
      if (controller.signal.aborted || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      if (running) { queued = true; return; }
      running = true; setState(current => ({ ...current, checking: true }));
      const failed: string[] = []; let changed = false, index = 0;
      const worker = async () => { while (index < sources.length && !controller.signal.aborted) {
        const source = sources[index++];
        try {
          const token = await sessionToken;
          if (controller.signal.aborted || await authStorage.getToken() !== token) { controller.abort(); return; }
          const rows = source.array ? await apiRequest<ActivityRow[]>(source.path, { signal: controller.signal, expectedToken: token }) : (await apiAllPages<{items: ActivityRow[]}>(source.path, controller.signal, token)).items;
          if (!Array.isArray(rows)) throw new Error('Danh sách không hợp lệ');
          if (initialized && JSON.stringify(snapshot[source.kind]) !== JSON.stringify(rows)) changed = true;
          snapshot[source.kind] = rows;
        } catch { if (!controller.signal.aborted) failed.push(source.title); }
      } };
      await Promise.all([worker(), worker(), worker()]);
      if (controller.signal.aborted) return;
      initialized = true; running = false;
      setState(current => ({ data: { ...snapshot }, checkedAt: Date.now(), failed, checking: false, changed: current.changed || changed }));
      if (changed) refreshScreens();
      if (queued) { queued = false; void load(); }
    };
    const schedule = () => { clearTimeout(timer); if (!controller.signal.aborted) timer = setTimeout(() => { void load().finally(schedule); }, 30000); };
    trigger.current = () => { void load(); };
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    const unsubscribe = subscribeDataChanged(() => { clearTimeout(timer); timer = setTimeout(() => { void load().finally(schedule); }, 400); });
    void load().finally(schedule);
    return () => { controller.abort(); clearTimeout(timer); subscription.remove(); unsubscribe(); };
  }, [role]);
  return <ActivityContext.Provider value={{ data: state.data, entries: buildActivity(role, userId, state.data), read, loading: !state.checkedAt, checking: state.checking, checkedAt: state.checkedAt, failed: state.failed, changed: state.changed, refresh, markRead, acknowledge: () => setState(current => ({ ...current, changed: false })) }}>{children}</ActivityContext.Provider>;
}
