import { useState } from 'react';
import { mutate } from '../../services/portal';
import { date, first, money, object, type Row } from './portal-data';

export function PolicySettlementActions({ resource, row, id, refresh }: { resource: string; row: Row; id: string; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancellation = object(row.paidCancellation);
  const transfer = object(row.commercialSettlement);
  const overdue = object(row.overdueSettlement);
  const isCancellation = resource === 'reservations' && Boolean(cancellation.state);
  const isTransfer = resource === 'transfers' && Boolean(transfer.refundState);
  const isOverdue = resource === 'returns' && (row.overdueFacilityReview === true || Boolean(overdue.physicalReturnDate));
  if (!isCancellation && !isTransfer && !isOverdue) return null;

  const ref = encodeURIComponent(id);
  const path = isCancellation ? `/reservations/${ref}/paid-cancellation` : isTransfer ? `/manager/transfers/${ref}/commercial-refund`
    : `/manager/early-return-requests/returns/${encodeURIComponent(first(row, 'id'))}/facility-review`;
  const verify = object(cancellation.quote).requiresRecovery === true && !cancellation.verification;
  const amount = Number(isCancellation ? object(cancellation.quote).total : transfer.refundAmount);
  const review = isCancellation && cancellation.state === 'REQUESTED';
  const refund = isCancellation && cancellation.state === 'REFUND_PENDING' || isTransfer && transfer.refundState === 'PENDING';
  const waive = isOverdue && row.overdueFacilityReview === true;
  const title = isCancellation ? 'Hủy đơn đã thanh toán' : isTransfer ? 'Quyết toán chuyển kho' : 'Phí sử dụng kho quá hạn';
  return <section className="manager-section">
    <h2>{title}</h2>
    {isCancellation && <p>Khoản hoàn {money(amount)}{cancellation.refundDueOn ? ` · Hạn hoàn ${date(cancellation.refundDueOn)}` : ''}
      {verify && review ? ' · Chờ nhân viên xác nhận đã thu hồi' : ''}{cancellation.refundedAt ? ` · Đã hoàn ${date(cancellation.refundedAt, true)}` : ''}</p>}
    {isTransfer && <p>Chênh lệch thuê {money(transfer.rentalAdjustment)} · Điều chỉnh cọc {money(transfer.depositAdjustment)} · {transfer.fee === 0 ? 'Miễn phí chuyển kho' : `Phí chuyển kho ${money(transfer.fee)}`} · Thu thêm {money(transfer.amountDue)} · Hoàn {money(amount)}{transfer.refundedAt ? ` · Đã hoàn ${date(transfer.refundedAt, true)}` : ''}</p>}
    {isOverdue && overdue.physicalReturnDate ? <p>Nhận kho ngày {date(overdue.physicalReturnDate)} · Phí {money(overdue.amount)}</p> : null}
    {(review || refund || waive) && <form className="portal-form" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      const form = new FormData(event.currentTarget);
      const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
      if (action === 'APPROVE' && verify) return;
      setBusy(true);
      setError('');
      try {
        const note = String(form.get('note') ?? '');
        await mutate(path, 'POST', waive ? { approved: action === 'WAIVE', reference: note } : refund
          ? { action: 'REFUND', amount, refunded: form.has('refunded'), reference: String(form.get('reference') ?? '').trim(), note }
          : { action, note });
        refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được quyết định.'); }
      finally { setBusy(false); }
    }}><fieldset disabled={busy}>
      {refund && <>
        <label>Mã giao dịch hoàn tiền<input name="reference" minLength={3} maxLength={120} required /></label>
        <label className="portal-checkbox"><input name="refunded" type="checkbox" required /> Đã chuyển đúng {money(amount)} cho khách</label>
      </>}
      {(!isTransfer || waive) && <label>Căn cứ xử lý<input name="note" minLength={3} maxLength={waive ? 200 : 500} required /></label>}
      {review && <><button className="button-primary" value="APPROVE" disabled={verify}>Duyệt hủy đơn</button><button className="button-secondary" value="REJECT">Từ chối yêu cầu</button></>}
      {refund && <button className="button-primary" value="REFUND">Ghi nhận đã hoàn tiền</button>}
      {waive && <><button className="button-primary" value="WAIVE">Miễn phí do lỗi cơ sở</button><button className="button-secondary" value="KEEP">Giữ phí theo điều khoản</button></>}
    </fieldset></form>}
    {error && <p role="alert">{error}</p>}
    {Boolean(cancellation.note) && !review && <p>{first(cancellation, 'note')}</p>}
  </section>;
}
