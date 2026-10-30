import { EntitySelect } from '../../components/EntitySelect';
import { useCustomerPagination } from "../../components/customer/useCustomerPagination";
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
import type { CustomerRenewal, CustomerRental } from "../../types/customer";
import { RenewalReview } from '../../components/manager/RenewalReview';
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
  const rentals = usePaginatedResource<CustomerRental>(
    "/customer/rentals?limit=100",
    user?.id ?? "",
  );
  const renewals = usePaginatedResource<CustomerRenewal>(
    "/customer/renewals?limit=100",
    user?.id ?? "",
    true,
  );
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
  const eligibleRentals = (rentals.data?.items ?? []).filter(item => !item.pendingRenewal && item.historicalPricing?.billingMode === 'MONTHLY');
  const [reservationId, setReservationId] = useScopedSelection('reservation', eligibleRentals.map(item => ({ value: item.reservationId, aliases: [item.reservationReference] })));

  const { items: visibleRenewals, pagination } = useCustomerPagination(
    (renewals.data?.items ?? []).filter(item => !renewalFilter || item.id === renewalFilter),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setMessage(null);
    setSubmitting(true);
    try {
      if (!eligibleRentals.some(item => item.reservationId === reservationId)) throw new Error('Chọn kho thuê theo tháng, chưa có yêu cầu gia hạn chờ xử lý.');
      const created = await mutate<CustomerRenewal>(
        "/customer/renewals",
        "POST",
        { reservationId, termMonths: Number(termMonths), paymentPlan },
        true,
      );
      setMessage({
        kind: "ok",
        text: created.status === 'APPROVED_PENDING_PAYMENT'
          ? "Gia hạn hợp lệ đã được duyệt tự động. Bạn cần xem và ký phụ lục trước khi thanh toán hóa đơn gia hạn."
          : "Đã ghi nhận yêu cầu gia hạn để nhân viên kiểm tra ngoại lệ.",
      });
      setReservationId("");
      renewals.refresh();
      rentals.refresh();
    } catch (error) {
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
    <section className="customer-page">
      <PortalPageHeader
        eyebrow="Gia hạn"
        title="Yêu cầu gia hạn"
        description="Yêu cầu hợp lệ được duyệt tự động; trường hợp có xung đột sẽ được nhân viên kiểm tra."
        action={
          <button
            className="button-secondary"
            type="button"
            onClick={renewals.refresh}
            disabled={renewals.loading}
          >
            <RefreshCw size={16} /> Làm mới
          </button>
        }
      />
      {renewalFilter && <p>Yêu cầu gia hạn được chọn · <Link to="/customer/renewals">Xem tất cả yêu cầu</Link></p>}
      <div className="customer-module-form-layout">
        <form className="customer-panel customer-module-form" onSubmit={submit}>
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
            <p>Chỉ kho thuê theo tháng và chưa có yêu cầu gia hạn chờ xử lý được chọn.</p>
            <label className="field-label">
              Kho đang thuê
              <EntitySelect
                aria-label="Kho đang thuê"
                required
                value={reservationId}
                onValueChange={(selectedValue) => setReservationId(selectedValue)}
              >
                <option value="">Chọn kho</option>
                {eligibleRentals
                  .map((item) => (
                    <option key={item.reservationId} value={item.reservationId}>
                      {item.storageType.name} · Kho {item.contracts.map(contract => contract.unit.unitCode).join(', ')} · đến {formatPortalDate(item.effectiveEndDate)} · {item.reservationReference}
                    </option>
                  ))}
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
              disabled={submitting || !reservationId}
            >
              <Repeat2 size={17} />{" "}
              {submitting ? "Đang gửi…" : "Gửi yêu cầu gia hạn"}
            </button>
            {!rentals.loading && (rentals.data?.items.length ?? 0) === 0 && (
              <small>Chưa có kho đang thuê đủ điều kiện gia hạn.</small>
            )}
          </fieldset>
        </form>
        <section className="customer-panel">
          <div className="customer-panel-heading">
            <div>
              <h2>Lịch sử gia hạn</h2>
              <p>Theo dõi kết quả xét duyệt, thanh toán và thời hạn mới của bạn.</p>
            </div>
            <CalendarRange size={20} />
          </div>
          {renewals.status === 401 ? (
            <CustomerSessionExpired />
          ) : renewals.loading ? (
            <PortalLoading label="Đang tải yêu cầu gia hạn…" />
          ) : renewals.error ? (
            <PortalError message={renewals.error} onRetry={renewals.refresh} />
          ) : (renewals.data?.items.length ?? 0) === 0 ? (
            <PortalEmpty
              icon={<Repeat2 size={30} />}
              title="Chưa có yêu cầu gia hạn"
            >
              <span>Các yêu cầu bạn gửi sẽ xuất hiện ở đây.</span>
            </PortalEmpty>
          ) : (
            <div className="customer-card-list">
              {visibleRenewals.map((item) => (
                <article
                  className="customer-record-card customer-record-card--compact"
                  key={item.id}
                >
                  <div className="customer-record-heading">
                    <div>
                      <small>{item.renewalCode}</small>
                      <h2>{item.reservation.storageType.name}</h2>
                    </div>
                    <CustomerStatus status={item.status} />
                  </div>
                  <dl className="customer-record-facts">
                    <div>
                      <dt>Kỳ gia hạn (không gồm ngày kết thúc)</dt>
                      <dd>
                        {formatPortalDate(item.previousEndDate)} –{" "}
                        {formatPortalDate(item.requestedEndDate)}
                      </dd>
                    </div>
                    <div>
                      <dt>Báo giá</dt>
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
                  <WorkflowHint>{workflowGuide('renewals', item.status, 'customer')}</WorkflowHint>
                  {item.status === 'APPROVED_PENDING_PAYMENT' && item.appendix?.acceptedAt && <Link className="button-primary" to={`/customer/payments${item.invoices?.find(invoice => invoice.renewalCycle === 1) ? `?invoice=${encodeURIComponent(item.invoices.find(invoice => invoice.renewalCycle === 1)!.id)}` : ''}`}>Xem hóa đơn & thanh toán gia hạn</Link>}
                  {item.status === 'COMPLETED' && <Link className="button-secondary" to="/customer/rentals">Xem thời hạn thuê mới</Link>}
                  {['APPROVED_PENDING_PAYMENT', 'COMPLETED'].includes(item.status) && item.appendix && (item.appendix.acceptedAt
                    ? <div><p className="customer-form-message is-ok">Phụ lục {item.appendix.code} đã được xác nhận.</p><DocumentFile path={`/customer/documents/renewals/${encodeURIComponent(item.id)}`} name={item.appendix.code} signed /></div>
                    : <button type="button" className="button-primary" onClick={() => setSelectedAppendix(item)}>Xem và xác nhận phụ lục {item.appendix.code}</button>)}
                  {selectedAppendix?.id === item.id && item.appendix && <div><DocumentFile path={`/customer/documents/renewals/${encodeURIComponent(item.id)}`} name={item.appendix.code} /><SignatureAgreement key={`${item.id}:${item.appendix.snapshotHash}`} label="Xác thực và ký phụ lục" busy={Boolean(acceptingAppendixId)} otpConfigured={item.appendix.otp?.emailConfigured} onRequestOtp={signatureImage => apiRequest<OtpReceipt>(`/customer/renewals/${encodeURIComponent(item.id)}/appendix/signature-otp`, { method: 'POST', body: JSON.stringify({ acceptanceName: user?.fullName, agreed: true, signatureImage, snapshotHash: item.appendix?.snapshotHash }) })} onSubmit={(signature, proof) => acceptAppendix(item, signature, proof)} /><button type="button" className="button-secondary" onClick={() => setSelectedAppendix(null)}>Đóng</button></div>}
                  <details className="renewal-review-details"><summary>Xem thời hạn và chi phí gia hạn</summary><RenewalReview row={{ ...item, customer: user }} showContracts={false} audience="customer" /></details>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      {pagination}
    </section>
  );
}
