
import { EntitySelect } from '../EntitySelect';
import { useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/auth-context';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { mutate } from '../../services/portal';
import { EARLY_RETURN_SUBJECT, isEarlyReturnRequest, isCurrentEarlyReturnApproval } from '../../utils/early-return';
import { formatPortalDate, moneyLabel } from './CustomerPortalHelpers';

import type { CustomerRental, CustomerSupportRequest } from '../../types/customer';
import { useScopedSelection } from './useScopedSelection';

export function EarlyReturnPanel({ rentals, activeReturnIds, onUpdated, checkedAt }: { checkedAt: number; rentals: CustomerRental[]; activeReturnIds: Set<string>; onUpdated: () => void }) {
  const { user } = useAuth();
  const requests = usePaginatedResource<CustomerSupportRequest>('/customer/support-requests?limit=100', user?.id ?? '', true);
  const [reason, setReason] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const early = (requests.data?.items ?? []).filter(isEarlyReturnRequest);
  const eligible = rentals.filter(rental => Date.parse(rental.effectiveEndDate) > checkedAt && !rental.pendingRenewal && !activeReturnIds.has(rental.reservationId) && !early.some(request => request.reservation.id === rental.reservationId && (request.status !== 'RESOLVED' || isCurrentEarlyReturnApproval(request, rental.effectiveEndDate))));
  const [reservationId, setReservationId] = useScopedSelection('reservation', eligible.map(item => ({ value: item.reservationId, aliases: [item.reservationReference] })));
  const selectedRental = eligible.find(item => item.reservationId === reservationId);
  const selectedDebt = selectedRental?.returnReadiness ? selectedRental.returnReadiness.totalOutstanding : selectedRental?.paymentDetails?.totalOutstanding ?? selectedRental?.billingSummary?.totalOutstanding;
  const submit = async (event: FormEvent) => { event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setMessage(''); try { await mutate('/customer/support-requests', 'POST', { reservationId, category: 'OTHER', subject: EARLY_RETURN_SUBJECT, description: reason.trim() }, true); setReason(''); setReservationId(''); setMessage('Đã gửi đề nghị. Khi được chấp thuận, chọn kho trong mục Gửi yêu cầu trả kho để tiếp tục.'); requests.refresh(); onUpdated(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Chưa gửi được đề nghị.'); } finally { setBusy(false); lock.current = false; } };
  return <section className="customer-panel early-return-panel">
    <h2>Muốn trả kho trước hạn?</h2>
    <p>Xin quản lý chấp thuận thời điểm trả sớm.</p>
    {requests.error ? <div role="alert">{requests.error}<button className="button-secondary" onClick={requests.refresh}>Tải lại đề nghị trả sớm</button></div> : <details className="early-return-disclosure">
      <summary>Gửi đề nghị mới</summary>
      <form className="customer-module-form" onSubmit={submit}>
        <fieldset disabled={busy || requests.loading}>
          <label className="field-label">Kho muốn trả sớm
            <EntitySelect aria-label="Kho muốn trả sớm" required value={reservationId} onValueChange={setReservationId}>
              <option value="">Chọn kho đang thuê</option>
              {eligible.map(rental => <option key={rental.reservationId} value={rental.reservationId}>{rental.contracts.map(contract => contract.unit.unitCode).join(', ') || rental.storageType.name} · Đến {formatPortalDate(rental.effectiveEndDate)}</option>)}
            </EntitySelect>
          </label>
          {selectedRental && typeof selectedDebt === 'number' && selectedDebt > 0 && <small>Cần thanh toán trước khi trả: <strong>{moneyLabel(selectedDebt)}</strong>.</small>}
          <label className="field-label">Lý do trả trước hạn<textarea required minLength={3} maxLength={3000} rows={2} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <button className="button-primary" disabled={!reservationId || busy}>{busy ? 'Đang gửi…' : 'Gửi đề nghị trả trước hạn'}</button>
          {!eligible.length && !requests.loading && <small>Không có kho phù hợp để gửi đề nghị mới.</small>}
        </fieldset>
      </form>
    </details>}
    {message && <p role="status">{message}</p>}
    {early.length > 0 && <div className="early-return-history"><h3>Đề nghị đã gửi ({early.length})</h3>{early.map(request => {
      const rental = rentals.find(item => item.reservationId === request.reservation.id);
      const currentApproval = Boolean(rental && isCurrentEarlyReturnApproval(request, rental.effectiveEndDate));
      const outdated = request.earlyReturnDecision === 'APPROVED' && rental && !currentApproval;
      const status = outdated ? 'Cần xét lại hạn thuê mới' : request.earlyReturnDecision === 'APPROVED' ? 'Đã chấp thuận trả sớm' : request.earlyReturnDecision === 'REJECTED' ? 'Chưa được chấp thuận' : request.status === 'RESOLVED' ? 'Đã có phản hồi' : 'Chờ quản lý xem xét';
      return <details className="early-return-disclosure" key={request.id}>
        <summary><span>{rental?.contracts.map(contract => contract.unit.unitCode).join(', ') || request.reservation.reference}<small>{status}</small></span></summary>
        <div className="early-return-request-detail">
          <small>{request.supportCode} · {request.reservation.reference}</small>
          <p><strong>Lý do: </strong>{request.description}</p>
          {request.resolutionNote && <p><strong>Phản hồi: </strong>{request.resolutionNote}</p>}
          {currentApproval && !activeReturnIds.has(request.reservation.id) && <a href="#return-request-form">Chọn kho trong Gửi yêu cầu trả kho để tiếp tục</a>}
          {outdated && <p>Hạn thuê đã thay đổi. Gửi đề nghị mới để quản lý xét lại.</p>}
          {request.earlyReturnFinancialReview?.appliedAt && request.earlyReturnFinancialReview.waivedAmount > 0 && <p>Điều chỉnh trước đây: đã miễn {moneyLabel(request.earlyReturnFinancialReview.waivedAmount)}. {request.earlyReturnFinancialReview.reason}</p>}
        </div>
      </details>;
    })}</div>}
  </section>;
}
