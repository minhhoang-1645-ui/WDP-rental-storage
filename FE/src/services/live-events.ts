import { useEffect, useRef } from 'react';
import { isStaffWorkflow } from '../utils/operation-access';
import { DATA_PULSE_KEY } from '../utils/notification-tools';

const canonicalSource = (path: string) => {
  const clean = path.split('?')[0].replace(/^\/reservations(?=\/|$)/, '/customer/reservations').replace(/^\/staff\/management\//, '/manager/');
  const staff = /^\/staff\/([^/]+)/.exec(clean);
  return staff && isStaffWorkflow(staff[1]) ? clean.replace('/staff/', '/manager/') : clean;
};

export const LIVE_REFRESH = 'wdp-live-refresh';
export const DATA_CHANGED = 'wdp-data-changed';
export function markFormDirty(form: HTMLFormElement) {
  form.setAttribute('data-wdp-dirty', 'true');
  form.setAttribute('data-wdp-edit-version', String(Number(form.getAttribute('data-wdp-edit-version') ?? 0) + 1));
}
export function notifyDataChanged(path: string) {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED, { detail: path }));
  // Cross-tab signal contains no dossier, token, role or customer information.
  try { localStorage.setItem(DATA_PULSE_KEY, JSON.stringify({ at: Date.now(), nonce: crypto.randomUUID() })); } catch { /* Polling remains available when storage is disabled. */ }
}
export function hasDraft() { return Boolean(document.querySelector('form[data-wdp-dirty="true"], form[data-wdp-submitting="true"]')); }
export function matchesSource(path: string, sources: string[]) {
  const clean = canonicalSource(path);
  const dependencies: Record<string, string[]> = {
    'early-return-requests': ['support-requests', 'invoices', 'payments', 'renewals', 'returns'],
    'support-requests': ['early-return-requests', 'transfers'],
    invoices: ['payments', 'payment-submissions', 'renewals', 'reservations', 'returns', 'deposit-settlements'],
    payments: ['invoices', 'payment-submissions', 'deposit-settlements'],
    contracts: ['reservations', 'invoices', 'appointments', 'renewals', 'returns', 'transfers'],
    rentals: ['contracts', 'appointments', 'renewals', 'returns', 'transfers', 'invoices', 'deposit-settlements'],
    units: ['reservations', 'appointments', 'returns', 'maintenance', 'transfers', 'renewals'],
    renewals: ['invoices', 'payments', 'payment-submissions', 'contracts'],
    appointments: ['contracts', 'invoices', 'reservations'],
    reservations: ['contracts', 'appointments', 'invoices'],
    'deposit-settlements': ['returns', 'invoices', 'payments'],
    'stored-items': ['stock-movements', 'transfers', 'returns'],
    returns: ['stock-movements', 'stored-items', 'contracts', 'deposit-settlements'],
  };
  return sources.map(canonicalSource).some(source => {
    if (clean.endsWith('/*')) return source.startsWith(clean.slice(0, -1));
    if (clean === source || clean.startsWith(source + '/') || source.startsWith(clean + '/')) return true;
    const [, scope, resource] = clean.split('/'), [, changedScope, changedResource] = source.split('/');
    return scope === changedScope && (dependencies[resource] ?? []).includes(changedResource);
  });
}
export function useLiveRefresh(path: string | null, refresh: () => void) {
  const callback = useRef(refresh);
  useEffect(() => { callback.current = refresh; }, [refresh]);
  useEffect(() => {
    if (!path) return;
    let pending = false;
    const resume = () => { if (pending && !hasDraft()) { pending = false; callback.current(); } };
    const update = (event: Event) => {
      if (!path) return;
      const sources = (event as CustomEvent<string[]>).detail;
      if (!sources || matchesSource(path, sources)) {
        if (hasDraft()) pending = true;
        else { pending = false; callback.current(); }
      }
    };
    const observer = new MutationObserver(resume);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-wdp-dirty', 'data-wdp-submitting'] });
    window.addEventListener(LIVE_REFRESH, update);
    return () => { observer.disconnect(); window.removeEventListener(LIVE_REFRESH, update); };
  }, [path]);
}
