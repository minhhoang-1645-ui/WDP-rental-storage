import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../services/api';
import { useLiveRefresh } from '../../services/live-events';
import type { Page } from './portal-data';

/** Locate a specific record for APIs that expose only a paged collection. */
export function useManagerListRecord<T extends { id: string }>(path: string, id: string | null, identity = '', hintPage = 1, limit = 50) {
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([path, id, identity, hintPage, limit]);
  const [result, setResult] = useState<{ key: string; revision: number; data: T | null; error: string }>();
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useLiveRefresh(id ? path : null, refresh);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const find = async () => {
      const params = new URLSearchParams({ page: String(hintPage), limit: String(limit) });
      const load = () => apiRequest<Page<T>>(path + '?' + params, { signal: controller.signal });
      const first = await load();
      let record = first.items.find(item => item.id === id);
      for (let page = 1; !record && page <= Math.ceil(first.total / first.limit); page++) {
        if (page === hintPage) continue;
        params.set('page', String(page));
        record = (await load()).items.find(item => item.id === id);
      }
      if (!controller.signal.aborted) setResult({ key, revision, data: record ?? null, error: '' });
    };
    find().catch(error => {
      if (!controller.signal.aborted) setResult({ key, revision, data: null, error: error instanceof Error ? error.message : 'Không thể tải hồ sơ.' });
    });
    return () => controller.abort();
  }, [key, id, path, hintPage, limit, revision]);
  const current = id && result?.key === key ? result : undefined;
  return { data: current?.data ?? null, error: current?.error ?? '', loading: Boolean(id && !current), refreshing: Boolean(current && current.revision !== revision), refresh };
}
