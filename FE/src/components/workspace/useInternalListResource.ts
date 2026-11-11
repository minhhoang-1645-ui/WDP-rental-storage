import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../services/api';
import { allPages } from '../../services/portal';
import { hasDraft, useLiveRefresh } from '../../services/live-events';
import type { Page } from '../manager/portal-data';

/** Internal UI only. Retain all-record filtering where the API has no equivalent filter. */
export function useInternalListResource<T>(path: string, identity: string, serverPaged: boolean) {
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const key = `${identity}:${path}:${revision}`;
  const [state, setState] = useState<{ key: string; data?: Page<T>; error?: string }>();
  useLiveRefresh(path, refresh);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const request = serverPaged ? apiRequest<Page<T>>(path, { signal: controller.signal }) : allPages<T>(path, controller.signal);
      request.then(data => { if (!controller.signal.aborted) setState({ key, data }); }).catch(error => { if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'Không thể tải danh sách.' }); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [path, serverPaged, key]);
  useEffect(() => { const focus = () => { if (!hasDraft()) refresh(); }; window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus); }, [refresh]);
  const current = state?.key === key ? state : undefined;
  return { data: current?.data, error: current?.error ?? '', loading: !current, refresh };
}
