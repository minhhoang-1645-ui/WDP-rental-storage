
import { EntitySelect } from '../EntitySelect';
import { ChevronDown, Plus } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { mutate } from '../../services/portal';
import { EARLY_RETURN_SUBJECT, earlyReturnAppliesTo, isEarlyReturnRequest, isCurrentEarlyReturnApproval } from '../../utils/early-return';
import { vietnamCalendarDate } from '../../utils/business-date';
import { formatPortalDate, moneyLabel } from './CustomerPortalHelpers';

import type { CustomerRental, CustomerSupportRequest } from '../../types/customer';
import { useScopedSelection } from './useScopedSelection';

type EarlyReturnSource = { data: { items: CustomerSupportRequest[] } | null; loading: boolean; error: string; refresh: () => void };

export function EarlyReturnPanel({ rentals, activeReturnIds, requests, checkedAt }: { checkedAt: number; rentals: CustomerRental[]; activeReturnIds: Set<string>; requests: EarlyReturnSource }) {
  const [params] = useSearchParams();
  const [reason, setReason] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const early = (requests.data?.items ?? []).filter(isEarlyReturnRequest);
  const eligible = rentals.flatMap(rental => rental.pendingRenewal ? [] : rental.contracts
    .filter(contract => contract.unit.status === 'OCCUPIED' && !contract.pendingRenewal && !contract.returnInProgress && contract.endDate > vietnamCalendarDate(checkedAt) && !activeReturnIds.has(contract.id)
      && !early.some(request => earlyReturnAppliesTo(request, rental.reservationId, contract.id)
        && (request.status !== 'RESOLVED' || isCurrentEarlyReturnApproval(request, contract.endDate))))
    .map(contract => ({ rental, contract })));
  const [contractId, setContractId] = useScopedSelection('contract', eligible.map(({ contract }) => ({ value: contract.id, aliases: [contract.contractCode] })));
  const selected = eligible.find(item => item.contract.id === contractId);
  const estimate = selected?.contract.earlyReturnEstimate;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current || !selected) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      await mutate('/customer/support-requests', 'POST', {
        reservationId: selected.rental.reservationId,
        rentalContractId: selected.contract.id,
        category: 'OTHER',
        subject: EARLY_RETURN_SUBJECT,
        description: reason.trim(),
      }, true);
      setReason('');
      setContractId('');
      setMessage('Đã gửi đề nghị. Khi được chấp thuận, chọn kho trong mục Gửi yêu cầu trả kho để tiếp tục.');
      requests.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Chưa gửi được đề nghị.');
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  return <section className="customer-panel early-return-panel">
    <h2>Muốn trả kho trước hạn?</h2>
    <p>Xin quản lý chấp thuận thời điểm trả sớm.</p>
    {requests.error ? <div role="alert">{requests.error}<button className="button-secondary" onClick={requests.refresh}>Tải lại đề nghị trả sớm</button></div> : <details className="early-return-disclosure early-return-create" open={params.get('early') === '1' || undefined}>
      <summary><Plus size={18} aria-hidden="true" /><span>Gửi đề nghị mới</span><ChevronDown className="early-return-create-chevron" size={18} aria-hidden="true" /></summary>
      <form className="customer-module-form" onSubmit={submit}>
        <fieldset disabled={busy || requests.loading}>
          <label className="field-label">Kho muốn trả sớm
            <EntitySelect aria-label="Kho muốn trả sớm" required value={contractId} onValueChange={setContractId}>
              <option value="">Chọn kho đang thuê</option>
              {eligible.map(({ rental, contract }) => <option key={contract.id} value={contract.id}>{contract.unit.unitCode} · {contract.unit.storageType?.name ?? rental.storageType.name} · Hạn {formatPortalDate(contract.endDate)}</option>)}
            </EntitySelect>
          </label>
          {estimate && typeof estimate.outstandingAmount === 'number' && <small>Nếu trả hôm nay, còn phải thanh toán {moneyLabel(estimate.outstandingAmount)} và dự kiến giảm {moneyLabel(estimate.waivedAmount)} trên hóa đơn.</small>}
          {selected && <small>Số tiền chính thức được tính khi bàn giao. Tiền cọc được xử lý riêng.</small>}
          <label className="field-label">Lý do trả trước hạn<textarea required minLength={3} maxLength={3000} rows={2} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <button className="button-primary" disabled={!selected || busy}>{busy ? 'Đang gửi…' : 'Gửi đề nghị trả trước hạn'}</button>
          {!eligible.length && !requests.loading && <small>Không có kho phù hợp để gửi đề nghị mới.</small>}
        </fieldset>
      </form>
    </details>}
    {message && <p role="status">{message}</p>}
    {early.length > 0 && <div className="early-return-history"><h3>Đề nghị đã gửi ({early.length})</h3>{early.map(request => {
      const rental = rentals.find(item => item.reservationId === request.reservation.id);
      const targets = rental?.contracts.filter(contract => earlyReturnAppliesTo(request, rental.reservationId, contract.id)) ?? [];
      const approvedTargets = targets.filter(contract => isCurrentEarlyReturnApproval(request, contract.endDate));
      const outdated = request.earlyReturnDecision === 'APPROVED' && targets.length > 0 && approvedTargets.length === 0;
      const status = outdated ? 'Cần xét lại hạn thuê mới' : request.earlyReturnDecision === 'APPROVED' ? 'Đã chấp thuận trả sớm' : request.earlyReturnDecision === 'REJECTED' ? 'Chưa được chấp thuận' : request.status === 'RESOLVED' ? 'Đã có phản hồi' : 'Chờ quản lý xem xét';
      return <details className="early-return-disclosure" key={request.id}>
        <summary><span>{request.unit?.unitCode || targets.map(contract => contract.unit.unitCode).join(', ') || request.reservation.reference}<small>{status}</small></span></summary>
        <div className="early-return-request-detail">
          <small>{request.supportCode} · {request.reservation.reference}</small>
          <p><strong>Lý do: </strong>{request.description}</p>
          {request.resolutionNote && <p><strong>Phản hồi: </strong>{request.resolutionNote}</p>}
          {approvedTargets.some(contract => !activeReturnIds.has(contract.id)) && <a href="#return-request-form">Chọn kho trong Gửi yêu cầu trả kho để tiếp tục</a>}
          {outdated && <p>Hạn thuê đã thay đổi. Gửi đề nghị mới để quản lý xét lại.</p>}
          {request.earlyReturnFinancialReview?.appliedAt && Boolean(request.earlyReturnFinancialReview.waivedAmount) && <p>Đã miễn {moneyLabel(request.earlyReturnFinancialReview.waivedAmount!)}. {request.earlyReturnFinancialReview.reason}</p>}
        </div>
      </details>;
    })}</div>}
  </section>;
}
