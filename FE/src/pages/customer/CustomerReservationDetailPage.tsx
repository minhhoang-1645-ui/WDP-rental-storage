import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  PackageOpen,
  ReceiptText,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { WorkflowHint } from '../../components/workspace/WorkHub';
import { CustomerSessionExpired } from "../../components/customer/CustomerSessionExpired";
import {
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
import { CustomerRentalProgress } from '../../components/customer/CustomerRentalProgress';

export function CustomerReservationDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const {
    data: reservation,
    error,
    status,
    loading,
    refresh,
  } = useApiResource<PendingReservation>(
    id ? "/reservations/" + encodeURIComponent(id) : null,
    user?.id ?? "",
  );
  if (status === 401) return <CustomerSessionExpired />;
  if (loading)
    return (
      <section className="customer-page">
        <PortalLoading label="Đang tải chi tiết yêu cầu đặt kho…" />
      </section>
    );
  if (error || !reservation)
    return (
      <section className="customer-page">
        <Link to="/customer/reservations" className="customer-back">
          <ArrowLeft size={16} /> Quay lại danh sách
        </Link>
        <PortalError
          message={error || "Không tìm thấy yêu cầu đặt kho này."}
          onRetry={refresh}
        />
      </section>
    );

  return (
    <section className="customer-page">
      <Link to="/customer/reservations" className="customer-back">
        <ArrowLeft size={16} /> Quay lại danh sách
      </Link>
      <PortalPageHeader
        eyebrow="Chi tiết yêu cầu đặt kho"
        title={reservation.id}
        description={`Tạo lúc ${formatPortalDate(reservation.createdAt, true)}. Theo dõi trạng thái yêu cầu và các bước tiếp theo.`}
        action={<ReservationStatus status={reservation.status} />}
      />
      <CustomerRentalProgress reservation={reservation as unknown as Record<string, unknown>} />
      <div className="customer-detail-grid">
        <div className="workspace-full-row"><WorkflowHint>{reservation.status === 'PENDING' ? 'NestBox đang kiểm tra yêu cầu của bạn và sẽ cập nhật kết quả tại đây.' : reservation.status === 'CONFIRMED' ? 'Đơn đã xác nhận. Đọc và ký đủ hợp đồng, thanh toán, rồi đặt lịch nhận kho khi đủ điều kiện.' : 'Xem kết quả trong hồ sơ; gửi hỗ trợ nếu bạn cần NestBox giải thích.'}</WorkflowHint></div>
        {reservation.status === 'CONFIRMED' && reservation.expiresAt && <div className="workspace-full-row booking-alert" role="status">Hạn giữ kho và thanh toán: <strong>{formatPortalDate(reservation.expiresAt, true)} (UTC+7)</strong>. Kiểm tra hóa đơn trước khi thanh toán.</div>}
        <div className="customer-detail-content">
          <section className="customer-panel">
            <h2>Thông tin kho</h2>
            <div className="customer-facts">
              <div>
                <dt>Loại kho</dt>
                <dd>{reservation.product.name}</dd>
              </div>
              <div>
                <dt>Mã sản phẩm</dt>
                <dd>{reservation.product.code}</dd>
              </div>
              <div>
                <dt>Kích thước</dt>
                <dd>{reservation.product.dimensions}</dd>
              </div>
              <div>
                <dt>Số lượng</dt>
                <dd>{reservation.quantity} kho</dd>
              </div>
              <div>
                <dt>Ưu tiên vị trí</dt>
                <dd>
                  {reservation.adjacencyPreference
                    ? "Ưu tiên các kho liền kề"
                    : "Không yêu cầu kho liền kề"}
                </dd>
              </div>
            </div>
          </section>
          <section className="customer-panel">
            <h2>Thời gian thuê yêu cầu</h2>
            <div className="customer-facts">
              <div>
                <dt>Ngày bắt đầu</dt>
                <dd>
                  <CalendarDays size={16} />{" "}
                  {formatPortalDate(reservation.startDate)}
                </dd>
              </div>
              <div>
                <dt>Ngày kết thúc</dt>
                <dd>
                  <CalendarDays size={16} />{" "}
                  {formatPortalDate(reservation.endDateExclusive)}
                </dd>
              </div>
              <div>
                <dt>Hình thức thời hạn</dt>
                <dd>
                  {reservation.periodMode === "duration"
                    ? `${reservation.durationMonths} tháng`
                    : "Theo ngày kết thúc"}
                </dd>
              </div>
            </div>
          </section>
          <section className="customer-panel">
            <h2>Báo giá tại thời điểm gửi</h2>
            <div className="customer-quote-list">
              {reservation.quote.lineItems.map((line) => (
                <div key={line.code}>
                  <span>
                    <strong>{line.label}</strong>
                    <small>{line.basis}</small>
                  </span>
                  <b>{quoteLabel(line.amount)}</b>
                </div>
              ))}
              <div>
                <strong>Tổng báo giá</strong>
                <b>
                  {quoteLabel(
                    reservation.quote.quotedTotalAmount ??
                      reservation.quote.grandTotal,
                  )}
                </b>
              </div>
            </div>
            <p className="customer-note">{reservation.quote.message}</p>
          </section>
          <section className="customer-panel">
            <h2>Thông tin tài khoản</h2>
            <div className="customer-facts">
              <div>
                <dt>Họ và tên</dt>
                <dd>{reservation.customer.fullName}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{reservation.customer.email}</dd>
              </div>
              <div>
                <dt>Số điện thoại</dt>
                <dd>{reservation.customer.phone || "Chưa cập nhật"}</dd>
              </div>
            </div>
          </section>
        </div>
        <aside className="customer-detail-aside">
          <section className="customer-panel">
            <h2>Trạng thái hiện tại</h2>
            <div className="customer-timeline">
              <div>
                <span>
                  <Clock3 size={17} />
                </span>
                <p>
                  <strong>
                    <ReservationStatus status={reservation.status} />
                  </strong>
                  <small>Trạng thái hiện tại lấy từ hệ thống.</small>
                </p>
              </div>
              <div>
                <span>
                  <CheckCircle2 size={17} />
                </span>
                <p>
                  <strong>Đã ghi nhận</strong>
                  <small>{formatPortalDate(reservation.createdAt, true)}</small>
                </p>
              </div>
            </div>
          </section>
          <section className="customer-panel customer-next-actions">
            <h2>Bước tiếp theo</h2>
            <p>
              {reservation.status === "PENDING"
                ? "Yêu cầu có ngoại lệ đang được nhân viên kiểm tra. Hóa đơn và hợp đồng sẽ xuất hiện sau khi được xác nhận."
                : reservation.status === "CONFIRMED"
                  ? "Xem hóa đơn và hợp đồng. Bạn có thể yêu cầu lịch bàn giao khi các hợp đồng đã đủ điều kiện."
                  : "Yêu cầu này không còn chờ xử lý. Bạn có thể gửi yêu cầu đặt kho mới khi cần."}
            </p>
            <Link className="button-secondary" to="/customer/contracts">
              <ReceiptText size={16} /> Xem hợp đồng
            </Link>
            <Link className="button-secondary" to="/customer/appointments">
              <CalendarDays size={16} /> Lịch bàn giao
            </Link>
            <Link className="button-secondary" to="/customer/payments">
              <PackageOpen size={16} /> Hóa đơn và thanh toán
            </Link>
          </section>
        </aside>
      </div>
    </section>
  );
}
