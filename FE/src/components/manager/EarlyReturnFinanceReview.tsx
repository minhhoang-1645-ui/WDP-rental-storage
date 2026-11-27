import { useState } from 'react';
import { date, first, money, object, rows, type Row } from './portal-data';
import { Facts } from './PortalUi';
import { Link } from 'react-router-dom';

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
      ['Tổng còn phải thu', amount(finance.outstandingAmount)],
      ...(Number(finance.penaltyAmount) > 0 ? [['Phí trả kho trước hạn', amount(finance.penaltyAmount)]] as [string, string][] : []),
      ...(Number(finance.refundOffset) > 0 ? [['Bù trừ từ khoản hoàn', amount(finance.refundOffset)]] as [string, string][] : []),
      ...(Number(finance.additionalCharge) > 0 ? [['Khoản quyết toán qua hóa đơn', amount(finance.additionalCharge)]] as [string, string][] : []),
      ['Miễn thu phần hóa đơn chưa thanh toán', amount(finance.waivedAmount)],
      [official ? (first(item, 'rentRefund.refundedAt') ? 'Tiền thuê và dịch vụ đã hoàn' : 'Tiền thuê và dịch vụ cần hoàn') : 'Tiền thuê và dịch vụ dự kiến hoàn', amount(finance.refundAmount)],
      [official ? (deposit.refundedAt ? 'Tiền cọc đã hoàn' : 'Tiền cọc cần hoàn') : 'Tiền cọc hiện có', deposit.status === 'PENDING_REVIEW' ? 'Chờ duyệt cọc' : amount(official ? deposit.refundAmount : item.currentDeposit)],
      ...(official ? [['Khấu trừ tiền cọc', deposit.status === 'PENDING_REVIEW' ? 'Chờ duyệt cọc' : amount(deposit.deductionAmount)]] as [string, string][] : []),
      ...(Number(deposit.outstandingAmount) > 0 ? [['Còn phải thu sau khấu trừ cọc', amount(deposit.outstandingAmount)]] as [string, string][] : []),
      ...(Number(finance.facilityFaultCredit) > 0 ? [['Giảm do lỗi cơ sở', amount(finance.facilityFaultCredit)]] as [string, string][] : []),
    ]} /> : <p>{first(item, 'estimateIssue') || 'Chưa có số tiền quyết toán cho hồ sơ này.'}</p>}
    <InvoiceAdjustments invoices={invoices} official={official} />
    {typeof deposit.id === 'string' && <Link to={'/manager/operations/deposit-settlements/' + encodeURIComponent(deposit.id)}>Xem hồ sơ hoàn tiền</Link>}
    {!official && <p>Số tiền chính thức được tính khi nhân viên nhận lại kho. Tiền cọc được xử lý riêng.</p>}
  </section>;
}

export function CombinedReturnRefund({ row, busy, onConfirm }: { row: Row; busy: boolean; onConfirm: (body: Row) => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [reference, setReference] = useState('');
  const settlement = object(row.earlyReturnSettlement);
  const closeout = object(settlement.closeout);
  const rentRefund = object(settlement.rentRefund);
  const rentAmount = Number(closeout.refundAmount);
  const depositAmount = Number(row.refundAmount);
  const depositPending = row.status !== 'SETTLED' && !row.refundedAt ? depositAmount : 0;
  const rentPending = rentRefund.refundedAt ? 0 : rentAmount;
  const total = depositPending + rentPending;
  const ready = row.status === 'SETTLED' || row.status === 'APPROVED' && depositPending > 0 && Number(row.outstandingAmount) === 0;
  const complete = total === 0 && Boolean(rentRefund.approvedAt) && row.status === 'SETTLED';
  return <section className="early-return-finance-review" aria-label="Xác nhận hoàn tiền">
    <h3>Xác nhận hoàn tiền</h3>
    <Facts items={[
      [row.refundedAt ? 'Tiền cọc đã hoàn' : 'Tiền cọc cần hoàn', money(depositAmount)],
      [rentRefund.refundedAt ? 'Tiền thuê và dịch vụ đã hoàn' : 'Tiền thuê và dịch vụ cần hoàn', money(rentAmount)],
    ]} />
    <InvoiceAdjustments invoices={rows(closeout.adjustedInvoices)} official />
    {complete ? <p role="status">{depositAmount + rentAmount > 0 ? <>Đã ghi nhận hoàn <strong>{money(depositAmount + rentAmount)}</strong>.</> : 'Đã xử lý phần hoàn tiền. Không có khoản cần hoàn.'}</p> :
      !ready ? <p>{row.status === 'PENDING_REVIEW' ? 'Duyệt tiền cọc để chốt tổng tiền hoàn.' : 'Xử lý khoản phải thu thêm để hoàn tất quyết toán.'}</p> :
        <form className="portal-form" onSubmit={event => {
          event.preventDefault();
          if (busy || total > 0 && (!confirmed || reference.trim().length < 2)) return;
          onConfirm({ depositAmount: depositPending, rentAmount: rentPending, refundConfirmed: total > 0, reference: total > 0 ? reference.trim() : undefined });
        }}>
          {total > 0 && <>
            <p>Tổng cần chuyển <strong>{money(total)}</strong></p>
            <label className="field-label">Mã giao dịch chuyển khoản
              <input value={reference} onChange={event => setReference(event.target.value)} required minLength={2} maxLength={160} />
            </label>
            <label className="portal-checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
              Tôi đã chuyển số tiền trên cho khách.
            </label>
          </>}
          <button className="button-primary" disabled={busy || total > 0 && (!confirmed || reference.trim().length < 2)}>
            {total > 0 ? 'Xác nhận đã chuyển tiền' : 'Hoàn tất quyết toán'}
          </button>
        </form>}
  </section>;
}
