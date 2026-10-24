import { useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';

type Listener = (path?: string) => void;
const changes = new Set<Listener>(), refreshes = new Set<Listener>(), drafts = new Set<object>();
export const notifyDataChanged = (path: string) => changes.forEach(listener => listener(path));
export const subscribeDataChanged = (listener: Listener) => { changes.add(listener); return () => { changes.delete(listener); }; };
export const refreshScreens = () => refreshes.forEach(listener => listener());
export const hasDraft = () => drafts.size > 0;
export function useDraftGuard(blocked = true) {
  useEffect(() => {
    if (!blocked) return;
    const token = {}; drafts.add(token);
    return () => { drafts.delete(token); if (!drafts.size) refreshScreens(); };
  }, [blocked]);
}
export function useLiveRefresh(path: string | null, refresh: () => void) {
  useFocusEffect(useCallback(() => {
    const listener = () => { if (path && !hasDraft()) refresh(); };
    refreshes.add(listener); return () => { refreshes.delete(listener); };
  }, [path, refresh]));
}
