const recordRoute = /^\/customer\/(reservations|contracts|invoices|appointments|renewals|returns|early-returns|transfers|stock-movements|deposit-settlements|support-requests|damage-claims)\/([\w-]+)$/;

const webRoutes: Record<string, [parameter: string, mobileResource: string]> = {
  '/customer/payments': ['invoice', 'invoices'],
  '/customer/contracts': ['contract', 'contracts'],
  '/customer/renewals': ['renewal', 'renewals'],
  '/customer/appointments': ['appointment', 'appointments'],
  '/customer/returns': ['return', 'returns'],
  '/customer/support': ['request', 'support-requests'],
  '/customer/transfers': ['request', 'transfers'],
  '/customer/damage-claims': ['claim', 'damage-claims'],
};

function recordId(value: string | null) {
  return value && /^[\w-]+$/.test(value) && value !== 'new' ? value : '';
}

export function customerNotificationTarget(target: string, kind: string) {
  const direct = recordRoute.exec(target);
  const supportResource = kind === 'early-returns' ? 'early-returns' : kind === 'transfers' ? 'transfers' : 'support-requests';
  if (direct && recordId(direct[2])) {
    const resource = direct[1] === 'support-requests' ? supportResource : direct[1];
    return '/customer/' + resource + '/' + direct[2];
  }

  const separator = target.indexOf('?');
  if (separator < 0 || target.includes('#')) return '';
  const path = target.slice(0, separator);
  const params = new URLSearchParams(target.slice(separator + 1));
  const id = (name: string) => recordId(params.get(name));
  if (path === '/customer/appointments') {
    const reservation = id('reservationId') || id('reservation');
    if (reservation) return '/customer/appointments?reservationId=' + reservation + '&book=1';
  }
  if (path === '/customer/returns') {
    const settlement = id('settlement');
    if (settlement) return '/customer/deposit-settlements/' + settlement;
    const reservation = id('reservation');
    if (reservation && kind === 'early-returns') return '/customer/returns/new?approvedEarlyReturn=1&reservationId=' + reservation;
  }
  if (path === '/customer/transfers' || path === '/customer/transfer-order') {
    const order = id(path === '/customer/transfers' ? 'transfer' : 'orderId');
    if (order) return '/customer/transfer-order?orderId=' + order;
  }
  const route = Object.hasOwn(webRoutes, path) ? webRoutes[path] : undefined;
  if (!route) return '';
  const [parameter, resource] = route;
  const record = id(parameter);
  const destination = resource === 'support-requests' ? supportResource : resource;
  return record ? '/customer/' + destination + '/' + record : '';
}
