import { useCustomerPagination } from "../../components/customer/useCustomerPagination";
import { usePaginatedResource } from "../../services/usePaginatedResource";
import { ArrowRightLeft, CircleHelp } from "lucide-react";
import { Link } from "react-router-dom";
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
import type { CustomerSupportRequest } from "../../types/customer";

export function CustomerTransfersPage() {
  const { user } = useAuth();
  const requests = usePaginatedResource<CustomerSupportRequest>(
    "/customer/support-requests?limit=100",
    user?.id ?? "",
    true,
  );
  const matchingTransfers = (requests.data?.items ?? []).filter(
    (item) =>
      item.resolutionType === "TRANSFER_RECOMMENDED" ||
      item.subject.toLocaleLowerCase("vi").includes("chuyển kho"),
  );
  const { items: transferRequests, pagination } =
    useCustomerPagination(matchingTransfers);
  return (
    <section className="customer-page">
      <PortalPageHeader
        eyebrow="Chuyển đổi kho"
        title="Yêu cầu chuyển kho"
        description="Bạn muốn chuyển sang kho khác? Hãy gửi yêu cầu để WDP kiểm tra và sắp xếp kho phù hợp cho bạn."
        action={
          <Link
            className="button-primary"
            to="/customer/support?category=UNIT_ISSUE&subject=Yêu cầu chuyển kho"
          >
            <CircleHelp size={17} /> Gửi yêu cầu
          </Link>
        }
      />
      <div className="customer-inline-notice customer-transfer-note">
        <strong>Các bước chuyển kho:</strong> Bạn gửi yêu cầu → WDP kiểm tra
        kho hiện tại và xác nhận kho mới → Nhân viên hỗ trợ bạn chuyển kho.
        Hãy chờ xác nhận trước khi chuyển hàng sang kho khác.
      </div>
      {requests.status === 401 ? (
        <CustomerSessionExpired />
      ) : requests.loading ? (
        <PortalLoading label="Đang tải yêu cầu chuyển kho…" />
      ) : requests.error ? (
        <PortalError message={requests.error} onRetry={requests.refresh} />
      ) : transferRequests.length === 0 ? (
        <PortalEmpty
          icon={<ArrowRightLeft size={30} />}
          title="Chưa có yêu cầu chuyển kho"
        >
          <span>
            Nếu kho gặp vấn đề hoặc cần đổi vị trí, hãy gửi yêu cầu để WDP đánh
            giá.
          </span>
          <Link
            className="button-primary"
            to="/customer/support?category=UNIT_ISSUE&subject=Yêu cầu chuyển kho"
          >
            Tạo yêu cầu hỗ trợ
          </Link>
        </PortalEmpty>
      ) : (
        <div className="customer-card-list">
          {transferRequests.map((item) => (
            <article
              className="customer-panel customer-record-card"
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
                  status={item.status}
                  resource="support-requests"
                />
              </div>
              <p>
                {item.reservation.reference}
                {item.unit ? ` · Kho ${item.unit.unitCode}` : ""}
              </p>
              {item.resolutionNote && (
                <p className="customer-inline-notice">{item.resolutionNote}</p>
              )}
            </article>
          ))}
        </div>
      )}
      {pagination}
    </section>
  );
}
