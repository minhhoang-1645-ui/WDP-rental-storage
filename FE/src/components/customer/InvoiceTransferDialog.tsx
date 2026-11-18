import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { usePaginatedResource } from '../../services/usePaginatedResource';
import { customerBillingApi } from '../../services/billing';
import { buildVietQrPayload } from '../../utils/vietqr';
import { isScheduledRenewalInvoice, invoicePaymentBlockedBySchedule, paymentWindowClosed } from '../../utils/payment-state';
import { PortalError, PortalLoading } from './CustomerPortalUi';
import { CustomerInvoiceDetails } from './CustomerInvoiceDetails';
import { Modal } from '../manager/PortalUi';
import type { CustomerInvoice } from '../../types/customer';
import type { BankTransferConfig, PaymentSubmission } from '../../types/payment';

export function InvoiceTransferDialog({ id, onlinePending, onlineBusy = false, onOnlinePay, onClose, onSaved }: {
  id: string;
  onlinePending: boolean;
  onlineBusy?: boolean;
  onOnlinePay?: (invoice: CustomerInvoice) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const invoice = useApiResource<CustomerInvoice>(`/customer/invoices/${encodeURIComponent(id)}`, user?.id ?? '');
  const bank = useApiResource<BankTransferConfig>('/customer/payment-config', user?.id ?? '');
  const submissions = usePaginatedResource<PaymentSubmission>('/customer/payment-submissions', user?.id ?? '', true);
  const [amount, setAmount] = useState<string | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const lock = useRef(false), keys = useRef(new Map<string, string>());
  const row = invoice.data;
  const selectedAmount = amount ?? (row ? String(row.balanceDue) : '');
  const pending = submissions.data?.items.some(item => item.invoice.id === id && item.status === 'PENDING_VERIFICATION');
  const scheduled = !!row && row.balanceDue > 0 && invoicePaymentBlockedBySchedule(row);
  const payable = row && !scheduled && ['OPEN', 'PARTIALLY_PAID'].includes(row.status) && row.balanceDue > 0 && row.signing?.complete !== false && !paymentWindowClosed(row) && !pending && !onlinePending && !saved;
  let qr = '';
  try { if (row && bank.data && Number(selectedAmount) <= row.balanceDue) qr = buildVietQrPayload(bank.data, Number(selectedAmount), row.invoiceCode); } catch { /* Display validation; never render an unusable QR. */ }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!row || !payable || onlineBusy || lock.current || !qr || submissions.loading || submissions.error) return;
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
  const signed = row?.signing?.complete !== false;
  const isOpen = !!row && ['OPEN', 'PARTIALLY_PAID'].includes(row.status) && row.balanceDue > 0;
  const paymentActionsReady = payable && !!bank.data && !bank.loading && !bank.error && !submissions.loading && !submissions.error;
  const vnpay = Boolean(onOnlinePay) && paymentActionsReady && bank.data?.vnpayConfigured === true && row.type !== 'SETTLEMENT';
  return <Modal title="Chi tiết hóa đơn" onClose={onClose} busy={busy}>
    {invoice.loading ? <PortalLoading label="Đang tải hóa đơn…" />
      : invoice.error ? <PortalError message={invoice.error} onRetry={invoice.refresh} />
      : row && <>
        <CustomerInvoiceDetails invoice={row} />
        {isOpen && <section className="customer-invoice-payment" aria-labelledby="customer-invoice-payment">
          <h3 id="customer-invoice-payment">Thanh toán</h3>
          {!signed && <p role="status">Bạn cần <Link to={row.signing?.renewalId ? `/customer/renewals?renewal=${encodeURIComponent(row.signing.renewalId)}` : `/customer/contracts?reservation=${encodeURIComponent(row.reservation.reference)}`}>ký tài liệu</Link> trước khi thanh toán.</p>}
          {(saved || pending) && <p role="status">Chuyển khoản đang chờ xác nhận. Vui lòng đợi kết quả.</p>}
          {onlinePending && <p role="status">Có giao dịch VNPay đang chờ xử lý.</p>}
          {scheduled && <p role="status">Hóa đơn gia hạn chưa đến kỳ thanh toán.</p>}
          {row.closeoutPaymentAllowed && isScheduledRenewalInvoice(row) && <p role="status">Kho đã được duyệt trả trước hạn. Có thể thanh toán sớm kỳ này.</p>}
          {paymentWindowClosed(row) && <p role="alert">Đã hết hạn giữ kho. Nếu đã chuyển tiền, hãy gửi yêu cầu hỗ trợ.</p>}
          {submissions.error && <PortalError message={submissions.error} onRetry={submissions.refresh} />}
          {payable && submissions.loading && <PortalLoading label="Đang kiểm tra giao dịch…" />}
          {vnpay && <button type="button" className="button-secondary" onClick={() => onOnlinePay?.(row)} disabled={onlineBusy || busy}>Thanh toán VNPay</button>}
          {payable && (bank.loading ? <PortalLoading label="Đang tải thông tin ngân hàng…" />
            : bank.error ? <PortalError message={bank.error} onRetry={bank.refresh} />
            : paymentActionsReady && (!bank.data?.configured
              ? <p>Chuyển khoản chưa khả dụng. <Link to={`/customer/support?reservation=${encodeURIComponent(row.reservation.id)}`}>Hỗ trợ thanh toán tại cơ sở</Link></p>
              : <details className="customer-invoice-file" open>
                <summary>Chuyển khoản ngân hàng</summary>
                <form className="portal-form" onSubmit={event => void submit(event)}>
                  <p>{bank.data.bankName} · {bank.data.accountName} · {bank.data.accountNumber}</p>
                  <p>Nội dung chuyển khoản <strong>{row.invoiceCode}</strong></p>
                  <label className="field-label">Số tiền chuyển khoản (VND)<input type="number" required min={1} max={row.balanceDue} step={1} value={selectedAmount} onChange={event => setAmount(event.target.value)} disabled={busy || onlineBusy} /></label>
                  {qr ? <div className="customer-invoice-qr"><QRCodeSVG value={qr} size={208} marginSize={4} title={`QR chuyển khoản ${row.invoiceCode}`} /></div> : <p role="alert">Kiểm tra số tiền và thông tin ngân hàng để tạo QR.</p>}
                  <label className="field-label">Mã giao dịch ngân hàng (nếu có)<input name="reference" maxLength={200} disabled={busy || onlineBusy} /></label>
                  <label className="field-label">Ghi chú chuyển khoản<textarea name="note" maxLength={1000} disabled={busy || onlineBusy} /></label>
                  <label className="portal-checkbox"><input type="checkbox" required disabled={busy || onlineBusy} />Tôi đã chuyển khoản thực tế cho hóa đơn này</label>
                  <button className="button-primary" disabled={busy || onlineBusy || !qr}>{busy ? 'Đang gửi…' : 'Gửi thông báo đã chuyển khoản'}</button>
                </form>
              </details>))}
        </section>}
      </>}
    {error && <p className="booking-alert is-error" role="alert">{error}</p>}
  </Modal>;
}
