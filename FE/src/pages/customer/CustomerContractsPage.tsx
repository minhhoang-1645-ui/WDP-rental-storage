import { Link, useSearchParams } from 'react-router-dom';
import { useCustomerPagination } from "../../components/customer/useCustomerPagination";
import { usePaginatedResource } from "../../services/usePaginatedResource";
import { FileText, RefreshCw } from "lucide-react";
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
import type { CustomerContract } from "../../types/customer";

export function CustomerContractsPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const reservationFilter = params.get('reservation');
  const { data, error, status, loading, refresh } =
    usePaginatedResource<CustomerContract>(
      "/customer/contracts?limit=100",
      user?.id ?? "",
      true,
    );
  const { items: contracts, pagination } = useCustomerPagination(
    (data?.items ?? []).filter(contract => !reservationFilter || contract.reservation.reference === reservationFilter || contract.reservation.id === reservationFilter),
  );
  return (
    <section className="customer-page">
      <PortalPageHeader
        eyebrow="Hợp đồng"
        title="Hợp đồng của tôi"
        description="Theo dõi hợp đồng và kho vật lý được cấp cho từng hợp đồng."
        action={
          <button
            className="button-secondary"
            type="button"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw size={16} /> Làm mới
          </button>
        }
      />
      {reservationFilter && <p>Hợp đồng của đơn {reservationFilter} · <Link to="/customer/contracts">Xem tất cả hợp đồng</Link></p>}
      {status === 401 ? (
        <CustomerSessionExpired />
      ) : loading ? (
        <PortalLoading label="Đang tải hợp đồng…" />
      ) : error ? (
        <PortalError message={error} onRetry={refresh} />
      ) : contracts.length === 0 ? (
        <PortalEmpty icon={<FileText size={30} />} title="Chưa có hợp đồng">
          <span>
            Hợp đồng sẽ xuất hiện sau khi yêu cầu đặt kho được NestBox xác nhận và cấp
            kho.
          </span>
        </PortalEmpty>
      ) : (
        <div className="customer-table-wrap customer-responsive-table">
          <table className="customer-table">
            <thead>
              <tr>
                <th>Mã hợp đồng</th>
                <th>Loại kho</th>
                <th>Kho được cấp</th>
                <th>Thời hạn</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <tr key={contract.id}>
                  <td data-label="Mã hợp đồng">
                    <strong>{contract.contractCode}</strong>
                    <small>{contract.reservation.reference}</small>
                  </td>
                  <td data-label="Loại kho">{contract.storageType.name}</td>
                  <td data-label="Kho được cấp">
                    <strong>{contract.storageUnit.unitCode}</strong>
                    <small>
                      {[contract.storageUnit.floor, contract.storageUnit.zone]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </td>
                  <td data-label="Thời hạn">
                    {formatPortalDate(contract.startDate)} –{" "}
                    {formatPortalDate(contract.endDate)}
                  </td>
                  <td data-label="Trạng thái">
                    <CustomerStatus status={contract.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pagination}
    </section>
  );
}
