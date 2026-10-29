import { useCustomerPagination } from "../../components/customer/useCustomerPagination";
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
import type { CustomerRental } from "../../types/customer";

export function CustomerRentalsPage() {
  const { user } = useAuth();
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
                      <Link to={`/customer/contracts?contract=${encodeURIComponent(contract.id)}`}><strong>{contract.unit.unitCode}</strong></Link>
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
                <Link className="button-primary" to={`/customer/payments?reservation=${encodeURIComponent(rental.reservationId)}`}>Hóa đơn & thanh toán</Link>
                <Link className="button-secondary" to={`/customer/contracts?reservation=${encodeURIComponent(rental.reservationReference)}`}>Xem hợp đồng</Link>
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
