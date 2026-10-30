import { DocumentFile } from './DocumentFile';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { customerBillingApi } from '../../services/billing';
import { buildVietQrPayload } from '../../utils/vietqr';
import { paymentWindowClosed } from '../../utils/payment-state';
import { moneyLabel } from './CustomerPortalHelpers';
import { PortalError, PortalLoading } from './CustomerPortalUi';
import { Modal } from '../manager/PortalUi';
import type { CustomerInvoice } from '../../types/customer';
import type { BankTransferConfig, PaymentSubmission } from '../../types/payment';

export function InvoiceTransferDialog({ id, onlinePending, onClose, onSaved }: { id: string; onlinePending: boolean; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const invoice = useApiResource<CustomerInvoice>(`/customer/invoices/${encodeURIComponent(id)}`, user?.id ?? '');
  const bank = useApiResource<BankTransferConfig>('/customer/payment-config', user?.id ?? '');
  const submissions = usePaginatedResource<PaymentSubmission>('/customer/payment-submissions', user?.id ?? '', true);
  const [amount, setAmount] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const lock = useRef(false), keys = useRef(new Map<string, string>());
  const row = invoice.data;
  const selectedAmount = amount || (row ? String(row.balanceDue) : '');
  const pending = submissions.data?.items.some(item => item.invoice.id === id && item.status === 'PENDING_VERIFICATION');
  const payable = row && ['OPEN', 'PARTIALLY_PAID'].includes(row.status) && row.balanceDue > 0 && row.signing?.complete !== false && !paymentWindowClosed(row) && !pending && !onlinePending && !saved;
  let qr = '';
  try { if (row && bank.data && Number(selectedAmount) <= row.balanceDue) qr = buildVietQrPayload(bank.data, Number(selectedAmount), row.invoiceCode); } catch { /* Display validation; never render an unusable QR. */ }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!row || !payable || lock.current || !qr || submissions.loading || submissions.error) return;
    const data = new FormData(event.currentTarget), numericAmount = Number(selectedAmount);
    if (!Number.isSafeInteger(numericAmount) || numericAmount < 1 || numericAmount > row.balanceDue) { setError('Số tiền phải là số nguyên dương không vượt số còn nợ.'); return; }
    const reference = String(data.get('reference') ?? '').trim(), note = String(data.get('note') ?? '').trim();
    const fingerprint = JSON.stringify([numericAmount, reference, note]);
    let key = keys.current.get(fingerprint); if (!key) { key = `customer-transfer-${crypto.randomUUID()}`; keys.current.set(fingerprint, key); }
    lock.current = true; setBusy(true); setError('');
    try { await customerBillingApi.createSubmission(id, numericAmount, key, reference, note); setSaved(true); onSaved(); submissions.refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không gửi được thông báo chuyển khoản.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Modal title={row && ['PAID', 'VOID'].includes(row.status) ? 'Chi tiết hóa đơn' : 'Chi tiết hóa đơn và chuyển khoản'} onClose={onClose} busy={busy}>
    {invoice.loading ? <PortalLoading label="Đang tải hóa đơn…" /> : invoice.error ? <PortalError message={invoice.error} onRetry={invoice.refresh} /> : row && <>
      <DocumentFile path={`/customer/documents/invoices/${encodeURIComponent(row.id)}`} name={row.invoiceCode} signed={row.signing?.complete} /><h3>{row.invoiceCode}</h3><p>Đơn {row.reservation.reference}</p>
      {['OPEN','PARTIALLY_PAID'].includes(row.status) && row.balanceDue>0 && <section className="invoice-current-balance" aria-label="Số tiền còn phải thanh toán"><span>Còn phải thanh toán cho hóa đơn này</span><strong>{moneyLabel(row.balanceDue)}</strong><small>{pending || onlinePending ? 'Có giao dịch đang chờ đối chiếu. Không chuyển thêm cho cùng hóa đơn.' : 'Đây là số còn lại sau khi trừ các khoản đã được xác nhận thanh toán.'}</small></section>}
      <dl className="manager-facts"><div><dt>Tiền thuê</dt><dd>{moneyLabel(row.rentalAmount)}</dd></div><div><dt>Tiền cọc</dt><dd>{moneyLabel(row.depositAmount)}</dd></div><div><dt>Dịch vụ</dt><dd>{moneyLabel(row.serviceAmount ?? 0)}</dd></div><div><dt>Phí được duyệt</dt><dd>{moneyLabel(row.chargeAmount ?? 0)}</dd></div><div><dt>Đã thanh toán</dt><dd>{moneyLabel(row.amountPaid)}</dd></div><div><dt>Còn phải thanh toán</dt><dd>{moneyLabel(row.balanceDue)}</dd></div></dl>
      {row.signing?.complete === false && <p role="status">Bạn cần <Link to={row.signing.renewalId ? `/customer/renewals?renewal=${encodeURIComponent(row.signing.renewalId)}` : `/customer/contracts?reservation=${encodeURIComponent(row.reservation.reference)}`}>đọc và ký tài liệu</Link> trước khi thanh toán.</p>}
      {(saved || pending) && <p role="status">Thông báo đã được gửi và đang chờ NestBox đối chiếu tiền thực nhận. Bạn chưa cần chuyển thêm cho cùng khoản tiền.</p>}
      {onlinePending && <p role="status">Đang theo dõi VNPay. Không chuyển khoản thêm cho cùng hóa đơn.</p>}
      {paymentWindowClosed(row) && <p role="alert">Đã hết hạn giữ kho. Nếu đã chuyển tiền, hãy gửi hỗ trợ để đối chiếu.</p>}
      {submissions.error && <PortalError message={submissions.error} onRetry={submissions.refresh} />}
      {payable && (bank.loading ? <PortalLoading label="Đang tải thông tin ngân hàng…" /> : bank.error ? <PortalError message={bank.error} onRetry={bank.refresh} /> : !bank.data?.configured ? <p>Chuyển khoản chưa khả dụng. {bank.data?.vnpayConfigured === true ? 'Bạn có thể thanh toán qua VNPay trên danh sách hóa đơn.' : 'Bạn có thể thanh toán tại cơ sở; hóa đơn chỉ cập nhật sau khi NestBox xác nhận thu tiền.'} <Link to={`/customer/support?reservation=${encodeURIComponent(row.reservation.id)}`}>Gửi hỗ trợ về hóa đơn</Link></p> : <form className="portal-form" onSubmit={event => void submit(event)}>
        <p>{bank.data.bankName} · {bank.data.accountName} · {bank.data.accountNumber}</p><p>Nội dung: <strong>{row.invoiceCode}</strong></p>
        <label className="field-label">Số tiền chuyển khoản (VND)<input type="number" required min={1} max={row.balanceDue} step={1} value={selectedAmount} onChange={event => setAmount(event.target.value)} disabled={busy} /></label>
        {qr ? <div style={{ textAlign: 'center', padding: 16, background: 'white' }}><QRCodeSVG value={qr} size={208} title={`QR chuyển khoản ${row.invoiceCode}`} /></div> : <p role="alert">Kiểm tra số tiền và thông tin ngân hàng để tạo QR.</p>}
        <p>Quét QR chưa phải là đã thanh toán. Kiểm tra người nhận và số tiền trong ứng dụng ngân hàng trước khi chuyển.</p>
        <label className="field-label">Mã giao dịch ngân hàng (nếu có)<input name="reference" maxLength={200} disabled={busy} /></label><label className="field-label">Ghi chú chuyển khoản<textarea name="note" maxLength={1000} disabled={busy} /></label>
        <label className="portal-checkbox"><input type="checkbox" required disabled={busy} />Tôi đã chuyển khoản thực tế cho hóa đơn này</label>
        <button className="button-primary" disabled={busy || !qr || submissions.loading || Boolean(submissions.error)}>{busy ? 'Đang gửi…' : 'Gửi thông báo đã chuyển khoản'}</button>
      </form>)}
    </>}
    {error && <p className="booking-alert is-error" role="alert">{error}</p>}
  </Modal>;
}
