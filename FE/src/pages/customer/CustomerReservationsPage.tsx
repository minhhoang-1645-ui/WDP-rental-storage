import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { newestFirst, isJustCreated, lastCreatedKey } from '../../utils/record-identity';
import { safeSessionStorage } from '../../services/browser-storage';
import { useCustomerPagination } from "../../components/customer/useCustomerPagination";
import { label } from "../../components/manager/portal-data";
import { CalendarDays, Filter, Plus, RefreshCw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { CustomerSessionExpired } from "../../components/customer/CustomerSessionExpired";
import {
  PortalEmpty,
  PortalError,
  PortalLoading,
  PortalPageHeader,
  ReservationStatus,
} from "../../components/customer/CustomerPortalUi";
import {
  formatPortalDate,
  quoteLabel,
} from "../../components/customer/CustomerPortalHelpers";
import { useApiResource } from "../../services/useApiResource";
import type { PendingReservation } from "../../types/booking";

export function CustomerReservationsPage() {
  const { user } = useAuth();
  const { data, error, status, loading, refresh } = useApiResource<
    PendingReservation[]
  >("/reservations", user?.id ?? "", true);
  const [params, setParams] = useSearchParams();
  const filter = params.get('status') || 'ALL';
  const search = params.get('search') || '';
  const updateFilter = (key: string, value: string) => setParams(previous => { const next = new URLSearchParams(previous); if (value && value !== 'ALL') next.set(key, value); else next.delete(key); next.delete('page'); return next; }, { replace: true });
  const reservations = newestFirst(data ?? []);
  const savedId = user ? safeSessionStorage.getItem(lastCreatedKey(user.id)) : null;
  const {
    items: visibleItems,
    pagination,
  } = useCustomerPagination(
    reservations.filter(item => (filter === 'ALL' || item.status === filter) && `${item.id} ${item.product.name}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))),
  );
  const statuses = Array.from(new Set(reservations.map((item) => item.status)));

  return (
    <section className="customer-page">
      <PortalPageHeader
        eyebrow="Đặt kho"
        title="Yêu cầu đặt kho của tôi"
        description="Yêu cầu đủ điều kiện được xác nhận tự động; trường hợp ngoại lệ sẽ được nhân viên kiểm tra."
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
              <Plus size={17} /> Đặt kho mới
            </Link>
          </div>
        }
      />
      {status === 401 ? (
        <CustomerSessionExpired />
      ) : loading ? (
        <PortalLoading label="Đang tải yêu cầu đặt kho…" />
      ) : error ? (
        <PortalError message={error} onRetry={refresh} />
      ) : reservations.length === 0 ? (
        <PortalEmpty
          title="Bạn chưa có yêu cầu đặt kho"
          action={
            <Link className="button-primary" to="/booking">
              <Plus size={17} /> Đặt kho mới
            </Link>
          }
        >
          Bắt đầu đặt kho để theo dõi báo giá, lịch thuê và trạng thái xác nhận
          tại đây.
        </PortalEmpty>
      ) : (
        <>
          <div className="customer-filter-row">
            <label className="field-label">Tìm đơn<input type="search" value={search} onChange={event => updateFilter('search', event.target.value)} placeholder="Mã đơn hoặc tên kho" /></label>
            <span>
              <Filter size={16} /> Lọc theo trạng thái
            </span>
            <select
              value={filter}
              onChange={(event) => {
                updateFilter('status', event.target.value);
              }}
              aria-label="Lọc theo trạng thái"
            >
              <option value="ALL">Tất cả ({reservations.length})</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {label(status)}
                </option>
              ))}
            </select>
          </div>
          {visibleItems.length === 0 ? (
            <PortalEmpty title="Không có yêu cầu đặt kho phù hợp">
              <span>Không có yêu cầu đặt kho nào khớp với bộ lọc hiện tại.</span>
              <button
                className="button-secondary"
                type="button"
                onClick={() => setParams(previous => { const next = new URLSearchParams(previous); next.delete('status'); next.delete('search'); next.delete('page'); return next; }, { replace: true })}
              >
                Xóa bộ lọc
              </button>
            </PortalEmpty>
          ) : (
            <>
              <div className="customer-table-wrap customer-reservations-table">
                <table className="customer-table">
                  <thead>
                    <tr>
                      <th>Đơn thuê</th>
                      <th>Số lượng / kích thước</th>
                      <th>Thời gian thuê</th>
                      <th>Ưu tiên</th>
                      <th>Báo giá</th>
                      <th>Trạng thái</th>
                      <th>Tạo lúc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <Link
                            className="customer-table-reference"
                            to={`/customer/reservations/${encodeURIComponent(item.id)}`}
                          >
                            {item.product.name}
                          </Link>
                          {isJustCreated(item, savedId) && <span className="record-new">Vừa gửi</span>}
                          <CopyRecordCode value={item.id} label="Mã đơn" />
                          <Link className="portal-text-button" to={`/customer/reservations/${encodeURIComponent(item.id)}`}>Xem chi tiết</Link>
                        </td>
                        <td>
                          <small>
                            {item.quantity} kho · {item.product.dimensions}
                          </small>
                        </td>
                        <td>
                          <span className="customer-date">
                            <CalendarDays size={15} />{" "}
                            {formatPortalDate(item.startDate)} –{" "}
                            {formatPortalDate(item.endDateExclusive)}
                          </span>
                        </td>
                        <td>
                          {item.adjacencyPreference
                            ? "Ưu tiên liền kề"
                            : "Không yêu cầu"}
                        </td>
                        <td>
                          {quoteLabel(
                            item.quote.quotedTotalAmount ??
                              item.quote.grandTotal,
                          )}
                        </td>
                        <td>
                          <ReservationStatus status={item.status} />
                        </td>
                        <td>{formatPortalDate(item.createdAt, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="customer-reservation-cards">
                {visibleItems.map((item) => (
                  <article key={item.id} className="customer-reservation-card">
                    <div className="customer-card-top">
                      <Link to={`/customer/reservations/${encodeURIComponent(item.id)}`}>
                        {item.product.name}
                      </Link>
                      <ReservationStatus status={item.status} />
                    </div>
                    {isJustCreated(item, savedId) && <span className="record-new">Vừa gửi</span>}
                    <CopyRecordCode value={item.id} label="Mã đơn" />
                    <p>Tạo lúc {formatPortalDate(item.createdAt, true)}</p>
                    <p>
                      {item.quantity} kho · {item.product.dimensions}
                    </p>
                    <dl>
                      <div>
                        <dt>Thời gian thuê</dt>
                        <dd>
                          {formatPortalDate(item.startDate)} –{" "}
                          {formatPortalDate(item.endDateExclusive)}
                        </dd>
                      </div>
                      <div>
                        <dt>Báo giá</dt>
                        <dd>{quoteLabel(item.quote.grandTotal)}</dd>
                      </div>
                    </dl>
                    <Link
                      className="button-secondary"
                      to={`/customer/reservations/${item.id}`}
                    >
                      Xem chi tiết
                    </Link>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {pagination}
    </section>
  );
}
