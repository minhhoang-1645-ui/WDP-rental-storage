import { useEffect } from 'react';
import { isStaffWorkflow } from '../utils/operation-access';

const canonicalSource = (path: string) => {
  const clean = path.split('?')[0].replace(/^\/staff\/management\//, '/manager/');
  const staff = /^\/staff\/([^/]+)/.exec(clean);
  return staff && isStaffWorkflow(staff[1]) ? clean.replace('/staff/', '/manager/') : clean;
};

export const LIVE_REFRESH = 'wdp-live-refresh';
export const DATA_CHANGED = 'wdp-data-changed';
export function hasDraft() { return Boolean(document.querySelector('form[data-wdp-dirty="true"], form[data-wdp-submitting="true"]')); }
export function matchesSource(path: string, sources: string[]) {
  const clean = canonicalSource(path);
  return sources.map(canonicalSource).some(source => clean.endsWith('/*') ? source.startsWith(clean.slice(0, -1)) : clean === source || clean.startsWith(source + '/'));
}
export function useLiveRefresh(path: string | null, refresh: () => void) {
  useEffect(() => {
    const update = (event: Event) => {
      if (!path || hasDraft()) return;
      const sources = (event as CustomEvent<string[]>).detail;
      if (!sources || matchesSource(path, sources)) refresh();
    };
    window.addEventListener(LIVE_REFRESH, update);
    return () => window.removeEventListener(LIVE_REFRESH, update);
  }, [path, refresh]);
}
