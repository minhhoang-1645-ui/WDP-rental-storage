import { moneyLabel } from '../../components/customer/CustomerPortalHelpers';
import type { PendingReservation } from '../../types/booking';
import { EntitySelect } from '../../components/EntitySelect';
import { useCustomerPagination } from "../../components/customer/useCustomerPagination";
import { CustomerFormSources } from "../../components/customer/CustomerFormSources";
import { mutate } from "../../services/portal";
import { usePaginatedResource } from "../../services/usePaginatedResource";
import { CircleHelp, RefreshCw, Send, Wrench } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { CustomerSessionExpired } from "../../components/customer/CustomerSessionExpired";
import { formatPortalDate } from "../../components/customer/CustomerPortalHelpers";
import {
  CustomerStatus,
  PortalEmpty,
  PortalError,
  PortalLoading,
  PortalPageHeader,
} from "../../components/customer/CustomerPortalUi";
import { ApiError } from "../../services/api";
import { useApiResource } from "../../services/useApiResource";
import { isTransferRequest } from '../../utils/transfer-request';
import { useScopedSelection } from '../../components/customer/useScopedSelection';
import type {
  CustomerInvoice,
  CustomerRental,
  CustomerSupportRequest,
  SupportCategory,
} from "../../types/customer";

const categories: Array<{ value: SupportCategory; label: string }> = [
  { value: "UNIT_ISSUE", label: "Vấn đề với kho" },
  { value: "LOCK_OR_KEY_ISSUE", label: "Khóa hoặc chìa khóa" },
  { value: "ACCESS_CODE_ISSUE", label: "Quyền truy cập" },
  { value: "FACILITY_EQUIPMENT_FAILURE", label: "Thiết bị tại cơ sở" },
  { value: "PAYMENT_SUPPORT", label: "Thanh toán hoặc hóa đơn" },
  { value: "STORED_ITEM_CONCERN", label: "Hàng hóa đang lưu trữ" },
  { value: "OTHER", label: "Vấn đề khác" },
];

export function CustomerSupportPage({ transferOnly = false }: { transferOnly?: boolean }) {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const requests = usePaginatedResource<CustomerSupportRequest>(
    "/customer/support-requests?limit=100",
    user?.id ?? "",
    true,
  );
  const reservations = useApiResource<PendingReservation[]>(
    "/reservations",
    user?.id ?? "",
  );
  const rentals = usePaginatedResource<CustomerRental>(
    "/customer/rentals?limit=100",
    user?.id ?? "",
  );
  const invoices = usePaginatedResource<CustomerInvoice>(
    "/customer/invoices?limit=100",
    user?.id ?? "",
  );
  const presetCategory = params.get("category") as SupportCategory | null;
  const [category, setCategory] = useState<SupportCategory>(
    categories.some((item) => item.value === presetCategory)
      ? presetCategory!
      : "UNIT_ISSUE",
  );
  const [unitId, setUnitId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [subject, setSubject] = useState(transferOnly ? 'Yêu cầu chuyển kho' : params.get("subject") ?? "");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  const operational = !["PAYMENT_SUPPORT", "OTHER"].includes(category);
  const reservationOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const rental of rentals.data?.items ?? [])
      map.set(rental.reservationReference, `${rental.storageType.name} · Kho ${rental.contracts.map(contract => contract.unit.unitCode).join(', ')} · ${rental.reservationReference}`);
    if (!operational) {
      for (const invoice of invoices.data?.items ?? [])
        if (!map.has(invoice.reservation.reference)) map.set(invoice.reservation.reference, `${invoice.reservation.storageType.name} · ${invoice.reservation.reference}`);
      for (const reservation of reservations.data ?? [])
        if (!map.has(reservation.id)) map.set(reservation.id, `${reservation.product?.name || 'Yêu cầu thuê kho'} · ${reservation.id}`);
    }
    return [...map].map(([id, reference]) => ({ id, reference }));
  }, [reservations.data, rentals.data, invoices.data, operational]);
  const [reservationId, setReservationId] = useScopedSelection('reservation', reservationOptions.map(option => ({ value: option.id, aliases: [...(rentals.data?.items ?? []).filter(item => item.reservationReference === option.id).map(item => item.reservationId), ...(invoices.data?.items ?? []).filter(item => item.reservation.reference === option.id).map(item => item.reservation.id)] })));
  const selectedRental = rentals.data?.items.find(
    (item) =>
      item.reservationId === reservationId ||
      item.reservationReference === reservationId,
  );
  const [contractId, setContractId] = useScopedSelection('contract', (selectedRental?.contracts ?? []).map(item => ({ value: item.id })));
  const selectedInvoices = (invoices.data?.items ?? []).filter(
    (item) =>
      item.reservation.id === reservationId ||
      item.reservation.reference === reservationId,
  );

  const { items: visibleRequests, pagination } = useCustomerPagination(
    (requests.data?.items ?? []).filter(item => !transferOnly || isTransferRequest(item)),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setMessage(null);
    setSubmitting(true);
    try {
      await mutate<CustomerSupportRequest>(
        "/customer/support-requests",
        "POST",
        {
          reservationId,
          category,
          subject,
          description,
          rentalContractId: operational && contractId ? contractId : undefined,
          storageUnitId: operational && unitId ? unitId : undefined,
          invoiceId:
            category === "PAYMENT_SUPPORT" && invoiceId ? invoiceId : undefined,
        },
        true,
      );
      setMessage({ kind: "ok", text: transferOnly ? 'Đã gửi yêu cầu chuyển kho. Nhân viên sẽ kiểm tra kho hiện tại và sắp xếp kho đích phù hợp.' : "Đã gửi yêu cầu hỗ trợ đến NestBox." });
      setSubject(transferOnly ? 'Yêu cầu chuyển kho' : '');
      setDescription("");
      setContractId("");
      setUnitId("");
      setInvoiceId("");
      requests.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Không thể gửi yêu cầu hỗ trợ.",
      });
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <section className="customer-page">
      <PortalPageHeader
        eyebrow={transferOnly ? 'Chuyển đổi kho' : 'Hỗ trợ'}
        title={transferOnly ? 'Yêu cầu chuyển kho' : 'Yêu cầu hỗ trợ'}
        description={transferOnly ? 'Chọn hợp đồng và kho đang sử dụng, mô tả lý do để nhân viên kiểm tra và sắp xếp chuyển sang kho cùng loại.' : 'Gửi vấn đề gắn với yêu cầu đặt kho, kho hoặc hóa đơn và theo dõi tiến độ xử lý.'}
        action={
          <button
            className="button-secondary"
            type="button"
            onClick={requests.refresh}
            disabled={requests.loading}
          >
            <RefreshCw size={16} /> Làm mới
          </button>
        }
      />
      <div className="customer-module-form-layout">
        <form className="customer-panel customer-module-form" onSubmit={submit}>
          <CustomerFormSources
            resources={[reservations, rentals, invoices]}
            retry={() => {
              reservations.refresh();
              rentals.refresh();
              invoices.refresh();
            }}
          />
          <fieldset
            disabled={
              submitting ||
              [reservations, rentals, invoices].some(
                (resource) => resource.loading || resource.error,
              )
            }
          >
            <h2>{transferOnly ? 'Gửi yêu cầu chuyển kho' : 'Gửi yêu cầu mới'}</h2>
            <label className="field-label">
              Yêu cầu đặt kho
              <EntitySelect
                aria-label="Yêu cầu đặt kho"
                required
                value={reservationId}
                onValueChange={(selectedValue) => {
                  setReservationId(selectedValue);
                  setContractId("");
                  setUnitId("");
                  setInvoiceId("");
                }}
              >
                <option value="">Chọn yêu cầu đặt kho</option>
                {reservationOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.reference}
                  </option>
                ))}
              </EntitySelect>
            </label>
            {!transferOnly && <label className="field-label">
              Loại hỗ trợ
              <select
                aria-label="Loại hỗ trợ"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as SupportCategory);
                  setReservationId("");
                  setContractId("");
                  setUnitId("");
                  setInvoiceId("");
                }}
              >
                {categories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>}
            {operational && selectedRental && (
              <>
                <label className="field-label">
                  Hợp đồng liên quan
                  <EntitySelect
                    aria-label="Hợp đồng liên quan"
                    required={transferOnly}
                    value={contractId}
                    onValueChange={(selectedValue) => {
                      setContractId(selectedValue);
                      setUnitId(
                        selectedRental.contracts.find(
                          (item) => item.id === selectedValue,
                        )?.unit.id ?? "",
                      );
                    }}
                  >
                    <option value="">{transferOnly ? 'Chọn hợp đồng / kho cần chuyển' : 'Toàn bộ yêu cầu thuê'}</option>
                    {selectedRental.contracts.map((item) => (
                      <option key={item.id} value={item.id}>
                        Kho {item.unit.unitCode} · {formatPortalDate(item.startDate)} – {formatPortalDate(item.endDate)} · {item.contractCode}
                      </option>
                    ))}
                  </EntitySelect>
                </label>
                {!contractId && <label className="field-label">
                  Kho liên quan
                  <EntitySelect
                    aria-label="Kho liên quan"
                    value={unitId}
                    onValueChange={(selectedValue) => setUnitId(selectedValue)}
                  >
                    <option value="">Chọn kho nếu có</option>
                    {selectedRental.contracts
                      .filter((item) => !contractId || item.id === contractId)
                      .map((item) => (
                        <option key={item.unit.id} value={item.unit.id}>
                          {item.unit.unitCode}
                        </option>
                      ))}
                  </EntitySelect>
                </label>}
                {contractId && <p className="activity-update-note">Kho được chọn theo hợp đồng: <strong>{selectedRental.contracts.find(item => item.id === contractId)?.unit.unitCode}</strong>. Bạn không cần chọn lại kho.</p>}
              </>
            )}
            {category === "PAYMENT_SUPPORT" && (
              <label className="field-label">
                Hóa đơn liên quan
                <EntitySelect
                  aria-label="Hóa đơn liên quan"
                  value={invoiceId}
                  onValueChange={(selectedValue) => setInvoiceId(selectedValue)}
                >
                  <option value="">Chọn hóa đơn nếu có</option>
                  {selectedInvoices.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.invoiceCode} · Còn {moneyLabel(item.balanceDue)} / {moneyLabel(item.totalAmount)} · {formatPortalDate(item.billingPeriodStart)} – {formatPortalDate(item.billingPeriodEnd)}
                    </option>
                  ))}
                </EntitySelect>
              </label>
            )}
            <label className="field-label">
              Tiêu đề
              <input
                readOnly={transferOnly}
                required
                minLength={3}
                maxLength={200}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Mô tả ngắn vấn đề"
              />
            </label>
            <label className="field-label">
              Chi tiết
              <textarea
                aria-label="Chi tiết"
                required
                minLength={3}
                maxLength={4000}
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Không nhập mã khóa hoặc thông tin truy cập bí mật"
              />
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
              <Send size={17} /> {submitting ? "Đang gửi…" : "Gửi yêu cầu"}
            </button>
            {reservationOptions.length === 0 &&
              !reservations.loading &&
              !rentals.loading &&
              !invoices.loading && (
                <small>
                  {operational
                    ? "Chưa có kho đang thuê để báo sự cố. Với vấn đề khác, hãy chọn loại hỗ trợ phù hợp."
                    : "Chưa có yêu cầu đặt kho hoặc hóa đơn để tạo yêu cầu hỗ trợ."}
                </small>
              )}
          </fieldset>
        </form>
        <section className="customer-panel">
          <div className="customer-panel-heading">
            <div>
              <h2>Yêu cầu của tôi</h2>
              <p>Trạng thái được cập nhật bởi đội vận hành.</p>
            </div>
            <CircleHelp size={20} />
          </div>
          {requests.status === 401 ? (
            <CustomerSessionExpired />
          ) : requests.loading ? (
            <PortalLoading label="Đang tải yêu cầu hỗ trợ…" />
          ) : requests.error ? (
            <PortalError message={requests.error} onRetry={requests.refresh} />
          ) : visibleRequests.length === 0 ? (
            <PortalEmpty
              icon={<Wrench size={30} />}
              title={transferOnly ? 'Chưa có yêu cầu chuyển kho' : 'Chưa có yêu cầu hỗ trợ'}
            >
              <span>Yêu cầu mới của bạn sẽ xuất hiện tại đây.</span>
            </PortalEmpty>
          ) : (
            <div className="customer-card-list">
              {visibleRequests.map((item) => { const transfer = isTransferRequest(item) ? item.transfers?.[0] : undefined; const transferLabel = transfer ? ({ REQUESTED: 'Chờ xác nhận kho mới', APPROVED: 'Đã duyệt · Chờ chuyển thực tế', COMPLETED: 'Đã chuyển kho', REJECTED: 'Chuyển kho chưa được chấp thuận' } as Record<string,string>)[transfer.status] : undefined; return (
                <article
                  className="customer-record-card customer-record-card--compact"
                  key={item.id}
                >
                  <div className="customer-record-heading">
                    <div>
                      <small>
                        {item.supportCode} ·{" "}
                        {formatPortalDate(item.createdAt, true)}
                      </small>
                      <h2>{item.subject}</h2>
                    </div>
                    <CustomerStatus
                      status={transfer?.status ?? item.status}
                      label={transferLabel}
                      resource="support-requests"
                    />
                  </div>
                  <p>
                    {categories.find(
                      (categoryItem) => categoryItem.value === item.category,
                    )?.label ?? item.category}{" "}
                    · {item.reservation.reference}
                    {item.unit ? ` · ${item.unit.unitCode}` : ""}
                  </p>
                  <p>{item.description}</p>
                  {transfer && <div className="customer-inline-notice"><strong>{transfer.transferCode} · {transferLabel}</strong><p>Kho nguồn: {transfer.fromUnit.unitCode} → Kho đích: {transfer.toUnit?.unitCode || 'Đang lựa chọn'}.</p>{transfer.completedAt && <p>Hoàn tất: {formatPortalDate(transfer.completedAt, true)}. Kho đang dùng và hợp đồng đã được cập nhật.</p>}</div>}
                  {item.resolutionNote && (
                    <p className="customer-inline-notice">
                      <strong>Kết quả:</strong> {item.resolutionNote}
                    </p>
                  )}
                </article>
              )})}
            </div>
          )}
        </section>
      </div>
      {pagination}
    </section>
  );
}
