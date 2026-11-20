import { useRef, useState } from 'react';
import { date, first, money, object, rows, type Row } from './portal-data';
import { Facts } from './PortalUi';
import { Link } from 'react-router-dom';
import { mutate } from '../../services/portal';

const amount = (value: unknown) => typeof value === 'number' ? money(value) : 'Chưa xác định';
const invoiceTypes: Record<string, string> = {
  INITIAL: 'Hóa đơn thuê ban đầu', RECURRING: 'Hóa đơn tiền thuê định kỳ', RENEWAL: 'Hóa đơn gia hạn',
};

function InvoiceAdjustment({ invoice, official }: { invoice: Row; official: boolean }) {
  const type = invoiceTypes[first(invoice, 'type')];
  const start = first(invoice, 'periodStart');
  const end = first(invoice, 'periodEnd');
  return <li className="early-return-invoice-adjustment">
    <div><strong>{first(invoice, 'code')}</strong>{type && <> · {type}</>}</div>
    {start && end && <div>Kỳ hóa đơn {date(start)} đến trước {date(end)}</div>}
    {typeof invoice.paidAmount === 'number' && <div>{invoice.paidAmount > 0 ? `Đã thu ${amount(invoice.paidAmount)}` : 'Chưa thu tiền'}</div>}
    {Number(invoice.unusedRent) > 0 && <div>{amount(invoice.unusedRent)} tiền {invoice.type === 'RENEWAL' ? 'gia hạn' : 'thuê'} của kỳ chưa bắt đầu</div>}
    {Number(invoice.unusedServices) > 0 && <div>{amount(invoice.unusedServices)} tiền dịch vụ chưa sử dụng</div>}
    {Number(invoice.facilityFaultCredit) > 0 && <div>{amount(invoice.facilityFaultCredit)} tiền thuê được giảm do lỗi cơ sở</div>}
    {Number(invoice.waived) > 0 && <div><strong>{official ? 'Miễn thu' : 'Dự kiến miễn thu'} {amount(invoice.waived)}</strong> · Phần khách chưa thanh toán</div>}
    {Number(invoice.refund) > 0 && <div><strong>{official ? 'Cần hoàn' : 'Dự kiến hoàn'} {amount(invoice.refund)}</strong> · Phần đã thu vượt số tiền khách phải trả</div>}
  </li>;
}

function InvoiceAdjustments({ invoices, official }: { invoices: Row[]; official: boolean }) {
  if (!invoices.length) return null;
  return <details><summary>Chi tiết miễn thu và hoàn tiền ({invoices.length} hóa đơn)</summary>
    <ul>{invoices.map(invoice => <InvoiceAdjustment key={first(invoice, 'id')} invoice={invoice} official={official} />)}</ul>
  </details>;
}

export function EarlyReturnFinanceFields({ item }: { item: Row }) {
  const official = Boolean(first(item, 'closeout.appliedAt'));
  const finance = object(official ? item.closeout : item.estimate);
  const deposit = object(item.depositSettlement);
  const invoices = rows(finance.adjustedInvoices);
  const title = official ? 'Quyết toán chính thức' : 'Quyết toán dự kiến';
  return <section className="early-return-finance-review" aria-label={title}>
    <h3>{title}</h3>
    {finance.effectiveDate ? <Facts items={[
      [official ? 'Ngày chấm dứt' : 'Ngày tính dự kiến', date(finance.effectiveDate)],
      ['Kỳ cuối phải trả', finance.lastCycleStart ? date(finance.lastCycleStart) + (finance.lastCycleEnd ? ' đến trước ' + date(finance.lastCycleEnd) : '') : '—'],
      ['Tiền thuê tính đến kỳ cuối', amount(finance.rentalAmount)],
      ['Tiền dịch vụ', amount(finance.serviceAmount)],
      ['Còn phải thu tiền thuê và dịch vụ', amount(finance.outstandingAmount)],
      ['Miễn thu phần hóa đơn chưa thanh toán', amount(finance.waivedAmount)],
      [official ? 'Tiền thuê và dịch vụ cần hoàn' : 'Tiền thuê và dịch vụ dự kiến hoàn', amount(finance.refundAmount)],
      [official ? 'Tiền cọc cần hoàn' : 'Tiền cọc hiện có', deposit.status === 'PENDING_REVIEW' ? 'Chờ duyệt cọc' : amount(official ? deposit.refundAmount : item.currentDeposit)],
      ...(official ? [['Khấu trừ tiền cọc', deposit.status === 'PENDING_REVIEW' ? 'Chờ duyệt cọc' : amount(deposit.deductionAmount)]] as [string, string][] : []),
      ...(Number(deposit.outstandingAmount) > 0 ? [['Còn phải thu sau khấu trừ cọc', amount(deposit.outstandingAmount)]] as [string, string][] : []),
      ...(Number(finance.facilityFaultCredit) > 0 ? [['Giảm do lỗi cơ sở', amount(finance.facilityFaultCredit)]] as [string, string][] : []),
    ]} /> : <p>{first(item, 'estimateIssue') || 'Chưa có số tiền quyết toán cho hồ sơ này.'}</p>}
    <InvoiceAdjustments invoices={invoices} official={official} />
    {typeof deposit.id === 'string' && <Link to={'/manager/operations/deposit-settlements/' + encodeURIComponent(deposit.id)}>Xem hồ sơ tiền cọc</Link>}
    {!official && <p>Số tiền chính thức được tính khi nhân viên nhận lại kho. Tiền cọc được xử lý riêng.</p>}
  </section>;
}

export function EarlyReturnRefundActions({ item, refresh, showBreakdown = false }: { item: Row; refresh: () => void; showBreakdown?: boolean }) {
  const [reference, setReference] = useState('');
  const [transferredAt, setTransferredAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const closeout = object(item.closeout);
  const refundAmount = closeout.refundAmount;
  const returnId = first(item, 'returnId');
  const approvedAt = first(item, 'rentRefund.approvedAt');
  const refundedAt = first(item, 'rentRefund.refundedAt');
  if (!returnId || !first(closeout, 'appliedAt') || typeof refundAmount !== 'number') return null;

  const save = async (action: 'settlement-approval' | 'refund-confirmation', details?: Row) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await mutate(`/manager/early-return-requests/returns/${encodeURIComponent(returnId)}/${action}`, 'POST', { amount: refundAmount, ...details }, true);
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa lưu được quyết toán.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return <section className="early-return-finance-review" aria-label="Hoàn tiền thuê và dịch vụ">
    <h3>Hoàn tiền thuê và dịch vụ</h3>
    {refundedAt ? <p role="status">Đã hoàn <strong>{money(refundAmount)}</strong> · {date(refundedAt, true)} · {first(item, 'rentRefund.reference')}</p> :
      refundAmount > 0 ? <p>Số tiền cần hoàn <strong>{money(refundAmount)}</strong></p> : <p>Không phát sinh tiền hoàn.</p>}
    {showBreakdown && <InvoiceAdjustments invoices={rows(closeout.adjustedInvoices)} official />}
    {!approvedAt ? <button className="button-primary" disabled={busy}
      onClick={() => void save('settlement-approval')}>Duyệt quyết toán tiền thuê</button> :
      <p>Đã duyệt quyết toán {date(approvedAt, true)}.</p>}
    {approvedAt && !refundedAt && refundAmount > 0 && <form className="portal-form" onSubmit={event => {
      event.preventDefault();
      void save('refund-confirmation', { reference: reference.trim(), transferredAt: new Date(transferredAt).toISOString() });
    }}>
      <label className="field-label">Mã chuyển khoản<input required maxLength={160} value={reference} onChange={event => setReference(event.target.value)} /></label>
      <label className="field-label">Thời điểm chuyển khoản<input required type="datetime-local" step="1" value={transferredAt} onChange={event => setTransferredAt(event.target.value)} /></label>
      <button className="button-primary" disabled={busy || !reference.trim() || !transferredAt}>Xác nhận đã chuyển {money(refundAmount)}</button>
    </form>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
