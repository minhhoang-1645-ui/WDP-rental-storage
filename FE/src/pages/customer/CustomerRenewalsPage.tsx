import { DetailCard } from '../../components/workspace/DetailRow';
import { useInternalListReturn } from '../../components/workspace/internal-list-memory';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { useCustomerOnlinePayment } from './useCustomerOnlinePayment';
import { EntitySelect } from '../../components/EntitySelect';
import { useListPagination } from "../../components/workspace/useListPagination";
import { CustomerFormSources } from "../../components/customer/CustomerFormSources";
import { mutate } from "../../services/portal";
import { usePaginatedResource } from "../../services/usePaginatedResource";
import { CalendarRange, RefreshCw, Repeat2 } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/auth-context";
import { CustomerSessionExpired } from "../../components/customer/CustomerSessionExpired";
import {
  formatPortalDate,
  moneyLabel,
} from "../../components/customer/CustomerPortalHelpers";
import {
  CustomerStatus,
  PortalEmpty,
  PortalError,
  PortalLoading,
  PortalPageHeader,
} from "../../components/customer/CustomerPortalUi";
import { ApiError } from "../../services/api";
import type { CustomerRenewal, CustomerRental, RenewalQuote } from "../../types/customer";
import type { BankTransferConfig } from '../../types/payment';
import { useApiResource } from '../../services/useApiResource';

import { Link, useSearchParams } from 'react-router-dom';
import { WorkflowHint } from '../../components/workspace/WorkHub';
import { workflowGuide } from '../../utils/workflow-guide';
import { SignatureAgreement } from '../../components/customer/SignatureAgreement';
import { useScopedSelection } from '../../components/customer/useScopedSelection';
import { DocumentFile } from '../../components/customer/DocumentFile';
import { apiRequest } from '../../services/api';
import type { OtpProof, OtpReceipt } from '../../components/customer/SignatureAgreement';

export function CustomerRenewalsPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const renewalFilter = params.get('renewal');
  const returnPath = useInternalListReturn('/customer/renewals');
  const rentals = usePaginatedResource<CustomerRental>(
    "/customer/rentals?limit=100",
    user?.id ?? "",
  );
  const renewals = usePaginatedResource<CustomerRenewal>(
    "/customer/renewals?limit=100",
    user?.id ?? "",
    true,
  );
  const paymentConfig = useApiResource<BankTransferConfig>(user?.id ? '/customer/payment-config' : null, user?.id);
  const { createOnlinePayment, onlineInvoiceId, hasPendingOnline, feedback } = useCustomerOnlinePayment(user?.id ?? '', renewals.refresh);
  const [termMonths, setTermMonths] = useState("3");
  const [paymentPlan, setPaymentPlan] = useState<"PAY_MONTHLY" | "PREPAID">(
    "PREPAID",
  );
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const [acceptingAppendixId, setAcceptingAppendixId] = useState('');
  const [selectedAppendix, setSelectedAppendix] = useState<CustomerRenewal | null>(null);
  const choices = (rentals.data?.items ?? []).flatMap(rental => rental.pendingRenewal || rental.historicalPricing?.billingMode !== 'MONTHLY' ? []
    : rental.contracts.filter(contract => contract.unit.status === 'OCCUPIED' && !contract.pendingRenewal && !contract.returnInProgress)
      .map(contract => ({ rental, contract })));
  const [contractId, setContractId] = useScopedSelection(params.has('contract') ? 'contract' : 'reservation', choices.map(({ rental, contract }) => ({
    value: contract.id,
    aliases: [contract.contractCode, ...(rental.contracts.length === 1 ? [rental.reservationId, rental.reservationReference] : [])],
  })));
  const selected = choices.find(item => item.contract.id === contractId);
  const quote = useApiResource<RenewalQuote>(selected && !renewalFilter ? '/customer/renewals/quote?' + new URLSearchParams({
    reservationId: selected.rental.reservationId, rentalContractId: contractId, termMonths, paymentPlan,
  }) : null, user?.id ?? '');

  const { items: visibleRenewals, pagination } = useListPagination(
    (renewals.data?.items ?? []).filter(item => !renewalFilter || item.id === renewalFilter),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitLock.current || !selected || !quote.data || quote.refreshing) return;
    submitLock.current = true;
    setMessage(null);
    setSubmitting(true);
    try {
      const created = await mutate<CustomerRenewal>(
        "/customer/renewals",
        "POST",
        { reservationId: selected.rental.reservationId, rentalContractId: contractId, termMonths: Number(termMonths), paymentPlan,
          expectedTotalAmount: quote.data.totalAmount, expectedEndDate: quote.data.requestedEndDate },
        true,
      );
      setMessage({
        kind: "ok",
        text: created.status === 'APPROVED_PENDING_PAYMENT'
          ? "Gia hạn hợp lệ đã được duyệt tự động. Bạn cần xem và ký phụ lục trước khi thanh toán hóa đơn gia hạn."
          : "Đã gửi yêu cầu gia hạn. Quản lý sẽ xem xét.",
      });
      setContractId("");
      renewals.refresh();
      rentals.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) { quote.refresh(); rentals.refresh(); }
      setMessage({
        kind: "error",
        text:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Không thể gửi yêu cầu gia hạn.",
      });
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };
  const acceptAppendix = async (item: CustomerRenewal, signatureImage: string, proof: OtpProof) => {
    if (!user || !item.appendix || acceptingAppendixId) return;
    setAcceptingAppendixId(item.id); setMessage(null);
    try {
      await mutate(`/customer/renewals/${encodeURIComponent(item.id)}/appendix/accept`, 'POST', { acceptanceName: user.fullName, agreed: true, ...proof, signatureImage, snapshotHash: item.appendix.snapshotHash });
      setMessage({ kind: 'ok', text: `Đã xác nhận phụ lục ${item.appendix.code}.` });
      setSelectedAppendix(null);
      renewals.refresh();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Không thể xác nhận phụ lục.' }); throw error;
    } finally { setAcceptingAppendixId(''); }
  };

  return (
    <section className={renewalFilter ? "customer-page record-detail-page" : "customer-page"}>
      <PortalPageHeader
        eyebrow="Gia hạn"
        title="Gia hạn kho"
        action={
          <button
            className="button-secondary"
            type="button"
            onClick={() => { renewals.refresh(); paymentConfig.refresh(); }}
            disabled={renewals.loading}
          >
            <RefreshCw size={16} /> Làm mới
          </button>
        }
      />
      <div className={renewalFilter ? "record-focused-layout" : "customer-module-form-layout"}>
        {!renewalFilter && <form className="customer-panel customer-module-form" onSubmit={submit}>
          <CustomerFormSources
            resources={[rentals, renewals]}
            retry={() => {
              rentals.refresh();
              renewals.refresh();
            }}
          />
          <fieldset
            disabled={
              submitting ||
              [rentals, renewals].some(
                (resource) => resource.loading || resource.error,
              )
            }
          >
            <h2>Tạo yêu cầu mới</h2>
            <label className="field-label">
              Kho đang thuê
              <EntitySelect
                aria-label="Kho đang thuê"
                required
                value={contractId}
                onValueChange={setContractId}
              >
                <option value="">Chọn kho</option>
                {choices.map(({ rental, contract }) => <option key={contract.id} value={contract.id}>
                  {contract.unit.unitCode} · {contract.unit.storageType?.name ?? rental.storageType.name} · Hạn {formatPortalDate(contract.endDate)}
                </option>)}
              </EntitySelect>
            </label>
            <label className="field-label">
              Thời hạn gia hạn
              <select
                value={termMonths}
                onChange={(event) => setTermMonths(event.target.value)}
              >
                <option value="1">1 tháng</option>
                <option value="3">3 tháng</option>
                <option value="6">6 tháng</option>
                <option value="12">12 tháng</option>
              </select>
            </label>
            <label className="field-label">
              Kế hoạch thanh toán
              <select
                value={paymentPlan}
                onChange={(event) =>
                  setPaymentPlan(
                    event.target.value as "PAY_MONTHLY" | "PREPAID",
                  )
                }
              >
                <option value="PREPAID">Thanh toán trước</option>
                <option value="PAY_MONTHLY">Thanh toán hàng tháng</option>
              </select>
            </label>
            {quote.loading && <p role="status">Đang tính giá gia hạn…</p>}
            {quote.error && <PortalError message={quote.error} onRetry={quote.refresh} />}
            {quote.data && <dl className="customer-record-facts" aria-label="Báo giá gia hạn">
              <div><dt>Hạn hiện tại</dt><dd>{formatPortalDate(quote.data.previousEndDate)}</dd></div>
              <div><dt>Hạn mới dự kiến</dt><dd>{formatPortalDate(quote.data.requestedEndDate)}</dd></div>
              <div><dt>Tổng tiền gia hạn</dt><dd><strong>{moneyLabel(quote.data.totalAmount)}</strong></dd></div>
              {paymentPlan === 'PAY_MONTHLY' && <div><dt>Thanh toán kỳ đầu</dt><dd>{moneyLabel(quote.data.monthlyUnitPrice)}</dd></div>}
              {quote.data.discountAmount > 0 && <div><dt>Giảm giá trả trước</dt><dd>{moneyLabel(quote.data.discountAmount)}</dd></div>}
            </dl>}
            {message && (
              <p
                className={`customer-form-message is-${message.kind}`}
                role="status"
              >
                {message.text}
              </p>
            )}
            <button
              className="button-primary"
              type="submit"
              disabled={submitting || !quote.data || quote.refreshing}
            >
              <Repeat2 size={17} />{" "}
              {submitting ? "Đang gửi…" : "Gửi yêu cầu gia hạn"}
            </button>
            {!rentals.loading && choices.length === 0 && (
              <small>Chưa có kho đang thuê đủ điều kiện gia hạn.</small>
            )}
          </fieldset>
        </form>}
        <section className="customer-request-section" aria-label="Lịch sử gia hạn">
          <div className="customer-panel-heading">
            <div>
              <h2>Lịch sử gia hạn</h2>
            </div>
            <CalendarRange size={20} />
          </div>
          {renewalFilter && <p className="customer-filter-notice"><Link to={returnPath}>Xem tất cả yêu cầu gia hạn</Link></p>}
          {renewals.status === 401 ? (
            <CustomerSessionExpired />
          ) : renewals.loading ? (
            <PortalLoading label="Đang tải yêu cầu gia hạn…" />
          ) : renewals.error ? (
            <PortalError message={renewals.error} onRetry={renewals.refresh} />
          ) : visibleRenewals.length === 0 ? (
            <PortalEmpty
              icon={<Repeat2 size={30} />}
              title={renewalFilter ? "Yêu cầu gia hạn không còn khả dụng" : "Chưa có yêu cầu gia hạn"}
            >
              <span>Các yêu cầu bạn gửi sẽ xuất hiện ở đây.</span>
            </PortalEmpty>
          ) : (
            <div className="customer-card-list">
              {feedback}
              {visibleRenewals.map((item) => {
                const invoice = item.invoices?.find(candidate => candidate.renewalCycle === 1);
                const canPay = item.status === 'APPROVED_PENDING_PAYMENT' && item.appendix?.acceptedAt
                  && invoice && invoice.status !== 'PAID' && invoice.status !== 'VOID' && invoice.balanceDue > 0;
                return (
                <DetailCard
                    detail={!renewalFilter ? { to: '/customer/renewals' + '?' + new URLSearchParams({ renewal: item.id }), label: `Xem yêu cầu gia hạn ${item.renewalCode}` } : undefined}
                  className="customer-record-card customer-record-card--compact customer-request-card"
                  key={item.id}
                >
                  <div className="customer-record-heading">
                    <div>
                      <CopyRecordCode value={item.renewalCode} />
                      <h2>{item.contracts?.map(contract => contract.unitCode).join(', ') || item.reservation.storageType.name}</h2>
                      {item.contracts?.length === 1 && <small>Hợp đồng {item.contracts[0].contractCode}</small>}
                    </div>
                    <CustomerStatus status={item.status} label={item.status === 'PENDING' ? 'Đang xem xét'
                      : item.status === 'APPROVED_PENDING_PAYMENT' ? item.appendix?.acceptedAt ? 'Chờ thanh toán' : 'Chờ ký phụ lục' : undefined} />
                  </div>
                  <dl className="customer-record-facts">
                    <div>
                      <dt>Gia hạn · {item.termMonths} tháng</dt>
                      <dd>
                        {formatPortalDate(item.previousEndDate)} –{" "}
                        {formatPortalDate(item.requestedEndDate)}
                      </dd>
                    </div>
                    <div>
                      <dt>Tiền gia hạn</dt>
                      <dd>
                        {moneyLabel(
                          item.quoteSnapshot.totalAmount,
                          item.quoteSnapshot.currency,
                        )}
                      </dd>
                    </div>
                  </dl>
                  {item.rejectionReason && (
                    <p className="customer-form-message is-error">
                      {item.rejectionReason}
                    </p>
                  )}
                  {item.status !== 'COMPLETED' && <WorkflowHint>{canPay
                    ? 'Thanh toán hóa đơn gia hạn để cập nhật hạn thuê.'
                    : workflowGuide('renewals', item.status, 'customer')}</WorkflowHint>}
                  {canPay && paymentConfig.data?.vnpayConfigured === true && <button type="button" className="button-primary" disabled={Boolean(onlineInvoiceId) || hasPendingOnline} onClick={() => void createOnlinePayment({ ...invoice, type: 'RENEWAL' })}>
                    {onlineInvoiceId === invoice.id ? 'Đang mở VNPay…' : 'Thanh toán VNPay'}
                  </button>}
                  {canPay && paymentConfig.data && paymentConfig.data.vnpayConfigured !== true && <small>VNPay hiện chưa khả dụng.</small>}
                  {canPay && paymentConfig.error && <small>Chưa tải được phương thức thanh toán. Bạn có thể thử lại trong chi tiết hóa đơn.</small>}
                  {item.status === 'APPROVED_PENDING_PAYMENT' && item.appendix?.acceptedAt && <Link className="button-secondary" to={invoice ? `/customer/payments?invoice=${encodeURIComponent(invoice.id)}` : '/customer/payments'}>Xem hóa đơn gia hạn</Link>}
                  {item.status === 'COMPLETED' && <Link className="button-secondary" to="/customer/rentals">Xem thời hạn thuê mới</Link>}
                  {item.status === 'COMPLETED' && <Link className="button-secondary" to={`/customer/payments?reservation=${encodeURIComponent(item.reservation.id)}`}>Xem hóa đơn</Link>}
                  {['APPROVED_PENDING_PAYMENT', 'COMPLETED'].includes(item.status) && item.appendix && (item.appendix.acceptedAt
                    ? null
                    : <button type="button" className="button-primary" onClick={() => setSelectedAppendix(item)}>Xem và ký phụ lục</button>)}
                  {selectedAppendix?.id === item.id && item.appendix && <div><DocumentFile path={`/customer/documents/renewals/${encodeURIComponent(item.id)}`} name={item.appendix.code} /><SignatureAgreement key={`${item.id}:${item.appendix.snapshotHash}`} label="Xác thực và ký phụ lục" busy={Boolean(acceptingAppendixId)} otpConfigured={item.appendix.otp?.emailConfigured} onRequestOtp={signatureImage => apiRequest<OtpReceipt>(`/customer/renewals/${encodeURIComponent(item.id)}/appendix/signature-otp`, { method: 'POST', body: JSON.stringify({ acceptanceName: user?.fullName, agreed: true, signatureImage, snapshotHash: item.appendix?.snapshotHash }) })} onSubmit={(signature, proof) => acceptAppendix(item, signature, proof)} /><button type="button" className="button-secondary" onClick={() => setSelectedAppendix(null)}>Đóng</button></div>}
                </DetailCard>
              ); })}
            </div>
          )}
        </section>
      </div>
      {pagination}
    </section>
  );
}
