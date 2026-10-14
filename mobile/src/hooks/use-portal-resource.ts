import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/auth/use-auth';
import { apiRequest } from '@/services/api';

// Keep the last successful result during refresh, but never across users or queries.
export function usePortalResource<T>(path: string | null) {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ scope: string; key: string; data?: T; error?: string }>({ scope: '', key: '' });
  const scope = `${user?.id ?? ''}:${path ?? ''}`;
  const key = `${scope}:${revision}`;
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useEffect(() => {
    if (!path || !user) return;
    const controller = new AbortController();
    apiRequest<T>(path, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ scope, key, data }); })
      .catch(error => {
        if (!controller.signal.aborted) setState(previous => ({
          scope, key, data: previous.scope === scope ? previous.data : undefined,
          error: error instanceof Error ? error.message : 'Không tải được dữ liệu.',
        }));
      });
    return () => controller.abort();
  }, [path, user, scope, key]);
  const data = state.scope === scope ? state.data : undefined;
  const current = state.key === key;
  return { data, error: current ? state.error : undefined, loading: Boolean(path && user && !data && !current), refreshing: Boolean(path && user && !current), refresh };
}

