import { type Notice, type NotificationData, type NotificationRow } from './notification-content.js';

const obj = (value: unknown): NotificationRow => value && typeof value === 'object' ? value as NotificationRow : {};
const str = (value: unknown) => typeof value === 'string' ? value : '';
const rows = (value: unknown) => Array.isArray(value) ? value.map(obj) : [];
const closed = ['EXPIRED', 'CANCELLED', 'REJECTED'];
const payableStates = ['OPEN', 'PARTIALLY_PAID'];
const calendar = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const detail = (resource: string, id: string) => id ? '/customer/' + resource + '/' + encodeURIComponent(id) : '';

/** Keep the same receipt tokens as the existing inbox. Mobile has its own screen paths. */
export function customerMobileNotices(notices: Notice[], data: NotificationData, now = Date.now()): Notice[] {
  const records = new Map<string, NotificationRow>();
  for (const [source, items] of Object.entries(data)) {
    for (const row of items) {
      if (str(row.id)) records.set(source + ':' + str(row.id), row);
    }
  }
  const waitingInvoices = new Set((data['payment-submissions'] ?? []).filter(row => row.status === 'PENDING_VERIFICATION')
    .map(row => str(obj(row.invoice).id)).filter(Boolean));
  const bookings = new Map<string, NotificationRow>();
  for (const row of data.reservations ?? []) {
    for (const id of [str(row.id), str(row.databaseId), str(row.reference)].filter(Boolean)) bookings.set(id, row);
  }
  return notices.map(notice => {
    const source = notice.key.slice(0, notice.key.indexOf(':'));
    const row = records.get(notice.key) ?? {};
    const id = str(row.id);
    const reservation = obj(row.reservation);
    const reservationId = str(reservation.id) || str(row.reservationId);
    const booking = bookings.get(reservationId) ?? bookings.get(str(reservation.reference));
    const reservationStatus = str(booking?.status) || str(reservation.status);
    const expiresAt = str(reservation.expiresAt) || str(booking?.expiresAt);
    const bookingClosed = closed.includes(reservationStatus);
    const expired = Date.parse(expiresAt) <= now;
    let { title, summary, actionLabel } = notice;
    let target = detail(notice.kind === 'transfers' && source === 'support-requests' ? 'transfers' : notice.kind, id);
    switch (source) {
      case 'contract-expiry':
        target = detail('contracts', id);
        break;
      case 'payment-due-reminder':
        target = detail('invoices', id);
        break;
      case 'closure-relocations':
        target = str(row.action).startsWith('CLOSURE_BOOKING_') ? detail('support-requests', str(obj(row.metadata).caseId)) : '/customer/rentals';
        break;
      case 'facility-lifecycle':
        target = '/customer/rentals';
        break;
      case 'invoices': {
        const renewal = row.type === 'RENEWAL';
        const subject = renewal ? 'Hóa đơn gia hạn' : 'Hóa đơn';
        const outstanding = payableStates.includes(str(row.status)) && Number(row.balanceDue) > 0;
        const scheduled = renewal && Number(row.renewalCycle) > 1 && Date.parse(str(row.dueAt)) > now && row.closeoutPaymentAllowed !== true;
        const signed = obj(row.signing).complete === true;
        const units = [...new Set(rows(row.contracts).map(contract => str(obj(contract.storageUnit).unitCode)).filter(Boolean))];
        if (units.length) summary = [summary, units.join(', ')].filter(Boolean).join(' · ');
        const usable = outstanding && !bookingClosed && !(row.type === 'INITIAL' && expired);
        actionLabel = '';
        if (row.status === 'PAID') title = subject + ' đã thanh toán';
        else if (row.status === 'VOID' || bookingClosed) title = subject + ' đã đóng';
        else if (outstanding) {
          const waiting = waitingInvoices.has(id);
          title = subject + (waiting ? ' chờ xác nhận chuyển khoản'
            : !usable ? ' đã hết hạn thanh toán'
              : scheduled ? ' chưa đến kỳ thanh toán' : !signed ? ' chờ ký tài liệu'
                : Number(obj(row.overduePayment).days) > 0 ? ' quá hạn thanh toán' : ' còn phải thanh toán');
          if (usable && !waiting && !scheduled && signed) actionLabel = 'Xem hóa đơn';
          if (usable && signed) summary = [summary, currency.format(Number(row.balanceDue))].filter(Boolean).join(' · ');
        }
        break;
      }
      case 'contracts': {
        const signed = Boolean(str(obj(row.terms).acceptedAt));
        const signable = !signed && !bookingClosed && !expired && Boolean(str(obj(row.terms).snapshotHash)) &&
          ['PENDING_PAYMENT', 'READY_FOR_HANDOVER'].includes(str(row.status));
        if (signable) { title = 'Hợp đồng chờ ký'; actionLabel = 'Ký hợp đồng'; }
        else if (!bookingClosed && !expired && signed && notice.actionLabel === 'Đặt lịch nhận kho' && reservationId) {
          title = 'Kho sẵn sàng đặt lịch nhận';
          target = '/customer/appointments?' + new URLSearchParams({ reservationId, book: '1' });
        } else {
          if (row.status === 'ACTIVE') title = 'Kho đã kích hoạt';
          else if (signed && !bookingClosed) title = 'Hợp đồng đã ký';
          actionLabel = '';
        }
        break;
      }
      case 'appointments': {
        if (row.status === 'COMPLETED') title = 'Lịch nhận kho đã bàn giao';
        else if (row.status === 'CONFIRMED') {
          title = 'Lịch nhận kho đã xác nhận';
          const scheduled = Date.parse(str(row.scheduledAt));
          if (Number.isFinite(scheduled)) summary = [summary, calendar.format(scheduled)].filter(Boolean).join(' · ');
        }
        break;
      }
      case 'returns':
        if (str(row.physicallyReturnedAt)) title = 'Kho trả đã được bàn giao';
        break;
      case 'renewals':
        actionLabel = '';
        if (row.status === 'APPROVED_PENDING_PAYMENT' && !bookingClosed) {
          const invoice = rows(row.invoices).find(item => Number(item.renewalCycle) === 1);
          const current = invoice && records.get('invoices:' + str(invoice.id));
          const appendix = obj(row.appendix);
          if (str(appendix.snapshotHash) && !str(appendix.acceptedAt)) {
            title = 'Gia hạn chờ ký phụ lục';
            actionLabel = 'Ký phụ lục gia hạn';
          } else if (current && str(appendix.acceptedAt) && payableStates.includes(str(current.status)) && Number(current.balanceDue) > 0) {
            title = 'Yêu cầu gia hạn đã duyệt';
            // The matching invoice owns the payment action. This row remains the renewal update.
            target = detail('invoices', str(current.id));
          }
        } else if (row.status === 'COMPLETED') title = 'Gia hạn đã có hiệu lực';
        break;
      case 'payment-submissions': {
        const invoiceId = str(obj(row.invoice).id);
        target = records.has('invoices:' + invoiceId) ? detail('invoices', invoiceId) : '';
        actionLabel = '';
        break;
      }
      case 'support-requests':
        if (notice.kind === 'early-returns') {
          const outstanding = data.invoices?.some(invoice => str(obj(invoice.reservation).id) === reservationId &&
            payableStates.includes(str(invoice.status)) && Number(invoice.balanceDue) > 0);
          actionLabel = !bookingClosed && !outstanding && notice.actionLabel ? 'Xem điều kiện trả kho' : '';
        }
        break;
      case 'deposit-settlements': {
        const invoice = obj(row.outstandingInvoice);
        const current = records.get('invoices:' + str(invoice.id));
        actionLabel = '';
        if (row.status === 'AWAITING_OUTSTANDING_PAYMENT' && current && payableStates.includes(str(current.status)) && Number(current.balanceDue) > 0) {
          // Keep the settlement and invoice as separate updates, with one outstanding invoice action.
          title = 'Quyết toán cọc còn khoản phải trả';
        } else if (row.status === 'SETTLED' && obj(row.refundRecord).method && str(obj(row.refundRecord).recordedAt)) {
          title = 'Đã ghi nhận hoàn cọc';
        }
        break;
      }
      case 'transfer-orders':
        target = id ? '/customer/transfer-order?' + new URLSearchParams({ orderId: id }) : '';
        if (bookingClosed || !str(obj(row.commercial).snapshotHash) || str(obj(row.commercial).acceptedAt)) actionLabel = '';
        break;
    }
    return { ...notice, title, summary, target, actionLabel: target ? actionLabel : '' };
  });
}
