import { useCustomerPagination } from "../../components/customer/useCustomerPagination";
import { useState } from "react";
import { DocumentFile } from "../../components/customer/DocumentFile";
import { InvoiceTransferDialog } from "../../components/customer/InvoiceTransferDialog";
import { ContractRenewalHistory } from "../../components/customer/ContractRenewalHistory";
import { ContractTransferHistory } from "../../components/customer/ContractTransferHistory";
import { Modal } from "../../components/manager/PortalUi";
import { readPendingOnlinePayments } from "../../services/online-payment-session";
import { useApiResource } from "../../services/useApiResource";
import { usePaginatedResource } from "../../services/usePaginatedResource";
import { CalendarClock, Plus, RefreshCw, Warehouse } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
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
import type { CustomerContract, CustomerInvoice, CustomerRental } from "../../types/customer";

export function CustomerRentalsPage() {
  const { user } = useAuth();
  const [detail, setDetail] = useState<{ rental: CustomerRental; kind: "invoices" | "contracts"; contractId?: string } | null>(null);
  const [params, setParams] = useSearchParams();
  const reservationFilter = params.get('reservation') ?? '';
  const { data, error, status, loading, refresh } =
    usePaginatedResource<CustomerRental>(
      "/customer/rentals?limit=100",
      user?.id ?? "",
      true,
    );
  const { items: rentals, pagination } = useCustomerPagination(
    (data?.items ?? []).filter(item => !reservationFilter || item.reservationId === reservationFilter || item.reservationReference === reservationFilter),
  );

  return (
    <section className="customer-page">
      {detail?.kind === "invoices" && <RentalInvoices rental={detail.rental} onClose={() => setDetail(null)} onSaved={refresh} />}
      {detail?.kind === "contracts" && <RentalContracts rental={detail.rental} initialId={detail.contractId} onClose={() => setDetail(null)} />}
      <PortalPageHeader
        eyebrow="Kho đang thuê"
        title="Kho của tôi"
        description="Theo dõi kho đã bàn giao, thời hạn thuê và số dư hóa đơn."
        action={
          <div className="customer-header-actions"><Link className="button-secondary" to="/customer/booking-history">Lịch sử đặt kho</Link>
            <button
              className="button-secondary"
              type="button"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw size={16} /> Làm mới
            </button>
            <Link className="button-primary" to="/booking">
              <Plus size={17} /> Đặt thêm kho
            </Link>
          </div>
        }
      />
      {reservationFilter && <div className="activity-update-note"><span>Đang xem kho của đơn {reservationFilter}</span><button type="button" className="portal-text-button" onClick={() => setParams(current => { const next = new URLSearchParams(current); next.delete('reservation'); return next; }, { replace: true })}>Xem tất cả kho đang thuê</button></div>}
      {status === 401 ? (
        <CustomerSessionExpired />
      ) : loading ? (
        <PortalLoading label="Đang tải kho đang thuê…" />
      ) : error ? (
        <PortalError message={error} onRetry={refresh} />
      ) : rentals.length === 0 ? (
        <PortalEmpty
          icon={<Warehouse size={30} />}
          title="Chưa có kho đang thuê"
        >
          <span>
            Kho sẽ xuất hiện sau khi hợp đồng được kích hoạt và hoàn tất bàn
            giao.
          </span>
        </PortalEmpty>
      ) : (
        <div className="customer-card-list">
          {rentals.map((rental) => (
            <article
              className="customer-panel customer-record-card"
              key={rental.reservationId}
            >
              <div className="customer-record-heading">
                <div>
                  <small>{rental.reservationReference}</small>
                  <h2>{rental.storageType.name}</h2>
                </div>
                <CustomerStatus status={rental.rentalState} />
              </div>
              <dl className="customer-record-facts">
                <div>
                  <dt>Thời hạn</dt>
                  <dd>
                    <CalendarClock size={15} />{" "}
                    {formatPortalDate(rental.startDate)} –{" "}
                    {formatPortalDate(rental.effectiveEndDate)}
                  </dd>
                </div>
                <div>
                  <dt>Số kho</dt>
                  <dd>{rental.unitCount}</dd>
                </div>
                <div>
                  <dt>Còn phải trả</dt>
                  <dd>{moneyLabel(rental.billingSummary.totalOutstanding)}</dd>
                </div>
              </dl>
              <div className="customer-unit-list">
                {rental.contracts.map((contract) => (
                  <div key={contract.id}>
                    <span>
                      <button type="button" className="portal-text-button" onClick={() => setDetail({ rental, kind: "contracts", contractId: contract.id })}><strong>{contract.unit.unitCode}</strong></button>
                      <small>
                        {[contract.unit.floor, contract.unit.zone]
                          .filter(Boolean)
                          .join(" · ") || "Chưa có vị trí chi tiết"}
                      </small>
                    </span>
                    <CustomerStatus status={contract.status} />
                  </div>
                ))}
              </div>
              <div className="customer-header-actions">
                <button type="button" className="button-primary" onClick={() => setDetail({ rental, kind: "invoices" })}>Xem hóa đơn</button>
                <button type="button" className="button-secondary" onClick={() => setDetail({ rental, kind: "contracts" })}>Xem hợp đồng</button>
              </div>
              <details className="customer-inline-notice"><summary>Giao nhận hàng & yêu cầu với kho này</summary><div className="customer-header-actions">
                {rental.contracts.map(contract => <Link key={contract.id} className="button-secondary" to={`/customer/stock-movements?rentalContractId=${encodeURIComponent(contract.id)}`}>Hàng hóa · {contract.unit.unitCode}</Link>)}
                {!rental.pendingRenewal && rental.historicalPricing?.billingMode === 'MONTHLY' && <Link className="button-secondary" to={`/customer/renewals?reservation=${encodeURIComponent(rental.reservationId)}`}>Gia hạn kho</Link>}
                <Link className="button-secondary" to={`/customer/transfers?reservation=${encodeURIComponent(rental.reservationId)}`}>Yêu cầu chuyển kho</Link>
                <Link className="button-secondary" to={`/customer/returns?reservation=${encodeURIComponent(rental.reservationId)}`}>Trả kho / đề nghị trả sớm</Link>
                <Link className="button-secondary" to={`/customer/support?reservation=${encodeURIComponent(rental.reservationId)}`}>Gửi hỗ trợ</Link>
              </div></details>
              {rental.pendingRenewal && (
                <p className="customer-inline-notice">
                  Yêu cầu gia hạn {rental.pendingRenewal.renewalCode} đang được
                  xử lý đến ngày{" "}
                  {formatPortalDate(rental.pendingRenewal.requestedEndDate)}.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
      {pagination}
    </section>
  );
}

function RentalInvoices({ rental, onClose, onSaved }: { rental: CustomerRental; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const invoices = usePaginatedResource<CustomerInvoice>("/customer/invoices", user?.id ?? "");
  const [selectedId, setSelectedId] = useState("");
  const related = (invoices.data?.items ?? []).filter(invoice => invoice.reservation.id === rental.reservationId);
  const invoiceId = selectedId || (related.length === 1 ? related[0].id : "");
  if (invoiceId) {
    const onlinePending = Boolean(user && readPendingOnlinePayments(user.id).some(item => item.invoiceId === invoiceId));
    return <InvoiceTransferDialog key={invoiceId} id={invoiceId} onlinePending={onlinePending} onClose={onClose} onSaved={onSaved} />;
  }

  return <Modal title={`Hóa đơn · ${rental.reservationReference}`} onClose={onClose}>
    {invoices.loading ? <PortalLoading label="Đang tải hóa đơn…" /> : invoices.error ? <PortalError message={invoices.error} onRetry={invoices.refresh} /> : related.length ? (
      <div className="portal-actions">
        {related.map(invoice => <button key={invoice.id} type="button" className="button-secondary" onClick={() => setSelectedId(invoice.id)}>
          {invoice.invoiceCode} · {moneyLabel(invoice.totalAmount)} <CustomerStatus status={invoice.status} />
        </button>)}
      </div>
    ) : <p>Đơn thuê này chưa có hóa đơn.</p>}
  </Modal>;
}

function RentalContracts({ rental, initialId, onClose }: { rental: CustomerRental; initialId?: string; onClose: () => void }) {
  const { user } = useAuth();
  const [id, setId] = useState(initialId ?? rental.contracts[0]?.id ?? "");
  const resource = useApiResource<CustomerContract>(id ? `/customer/contracts/${encodeURIComponent(id)}` : null, user?.id ?? "");
  const contract = resource.data;

  return <Modal title="Chi tiết hợp đồng" onClose={onClose}>
    {rental.contracts.length > 1 && <label className="field-label">
      Chọn hợp đồng
      <select value={id} onChange={event => setId(event.target.value)}>
        {rental.contracts.map(item => <option key={item.id} value={item.id}>{item.contractCode} · {item.unit.unitCode}</option>)}
      </select>
    </label>}
    {!id ? <p>Đơn thuê này chưa có hợp đồng.</p> : resource.loading ? <PortalLoading label="Đang tải hợp đồng…" /> : resource.error ? <PortalError message={resource.error} onRetry={resource.refresh} /> : contract && <>
      <h3>{contract.contractCode}</h3>
      <dl className="manager-facts">
        <div><dt>Đơn đặt kho</dt><dd>{contract.reservation.reference}</dd></div>
        <div><dt>Kho</dt><dd>{contract.storageUnit.unitCode}</dd></div>
        <div><dt>Thời hạn</dt><dd>{formatPortalDate(contract.startDate)} – {formatPortalDate(contract.endDate)}</dd></div>
        <div><dt>Trạng thái</dt><dd><CustomerStatus status={contract.status} /></dd></div>
      </dl>
      {contract.terms.acceptedAt && <p>Đã ký bởi {contract.terms.acceptanceName} lúc {formatPortalDate(contract.terms.acceptedAt, true)}.</p>}
      <DocumentFile path={`/customer/documents/contracts/${encodeURIComponent(contract.id)}`} name={contract.contractCode} signed={Boolean(contract.terms.acceptedAt)} />
      <ContractTransferHistory contract={contract} scope="customer" />
      <ContractRenewalHistory contract={contract} scope="customer" />
    </>}
  </Modal>;
}
