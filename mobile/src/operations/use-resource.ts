import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { apiAllPages, apiRequest } from '@/services/api';
import { hasDraft, useLiveRefresh } from '@/services/live-events';

export function useResource<T>(path: string | null, paginated = false) {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>();
  const key = `${user?.id ?? ''}:${path}:${paginated}:${revision}`;
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useLiveRefresh(path, refresh);
  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', state => {
      if (path && state === 'active' && previous !== 'active' && !hasDraft()) refresh();
      previous = state;
    });
    return () => subscription.remove();
  }, [path, refresh]);
  useFocusEffect(useCallback(() => { if (path && !hasDraft()) refresh(); }, [path, refresh]));
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    const request = paginated ? apiAllPages<T>(path, controller.signal) : apiRequest<T>(path, { signal: controller.signal });
    request.then(data => { if (!controller.signal.aborted) setResult({ key, data }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : 'Không tải được dữ liệu.' }); });
    return () => controller.abort();
  }, [key, path, paginated]);
  const current = result?.key === key ? result : undefined;
  return { data: current?.data, error: current?.error, loading: Boolean(path && !current), refresh };
}
