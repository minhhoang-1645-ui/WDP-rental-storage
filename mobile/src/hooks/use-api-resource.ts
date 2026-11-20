import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { apiAllPages } from '@/services/api';
import { useAuth } from '@/auth/use-auth';

export function useApiResource<T>(path: string | null) {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key: '' });
  const key = `${user?.id ?? ''}:${path ?? ''}:${revision}`;
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useFocusEffect(useCallback(() => { if (path) refresh(); }, [path, refresh]));

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    apiAllPages<T>(path, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setState({ key, data }); })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'Không tải được dữ liệu.' });
      });
    return () => controller.abort();
  }, [path, key]);

  const current = state.key === key ? state : undefined;
  return { data: current?.data, error: current?.error, loading: Boolean(path && !current), refresh };
}
