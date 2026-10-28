import { useCustomerPagination } from "../../components/customer/useCustomerPagination";
import { usePaginatedResource } from "../../services/usePaginatedResource";
import { FileText, RefreshCw } from "lucide-react";
import { useState } from "react";
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
import type { CustomerContract } from "../../types/customer";
import { mutate } from "../../services/portal";
import { ApiError } from "../../services/api";

export function CustomerContractsPage() {
  const { user } = useAuth();
  const { data, error, status, loading, refresh } =
    usePaginatedResource<CustomerContract>(
      "/customer/contracts?limit=100",
      user?.id ?? "",
      true,
    );
  const { items: contracts, pagination } = useCustomerPagination(
    data?.items ?? [],
  );
  const [acceptingId, setAcceptingId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const accept = async (contract: CustomerContract) => {
    if (!user || acceptingId) return;
    if (!window.confirm(`Bạn xác nhận đã đọc và đồng ý điều khoản phiên bản ${contract.terms.version} của hợp đồng ${contract.contractCode}?`)) return;
    setAcceptingId(contract.id); setMessage(null);
    try {
      await mutate(`/customer/contracts/${encodeURIComponent(contract.id)}/accept`, "POST", { acceptanceName: user.fullName });
      setMessage(`Đã lưu xác nhận hợp đồng ${contract.contractCode}.`);
      refresh();
    } catch (caught) { setMessage(caught instanceof ApiError || caught instanceof Error ? caught.message : "Không thể xác nhận hợp đồng."); }
    finally { setAcceptingId(""); }
  };
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
      {status === 401 ? (
        <CustomerSessionExpired />
      ) : loading ? (
        <PortalLoading label="Đang tải hợp đồng…" />
      ) : error ? (
        <PortalError message={error} onRetry={refresh} />
      ) : contracts.length === 0 ? (
        <PortalEmpty icon={<FileText size={30} />} title="Chưa có hợp đồng">
          <span>
            Hợp đồng sẽ xuất hiện sau khi yêu cầu đặt kho được WDP xác nhận và cấp
            kho.
          </span>
        </PortalEmpty>
      ) : (
        <>
        {message && <p className="customer-form-message" role="status">{message}</p>}
        <div className="customer-table-wrap customer-responsive-table">
          <table className="customer-table">
            <thead>
              <tr>
                <th>Mã hợp đồng</th>
                <th>Loại kho</th>
                <th>Kho được cấp</th>
                <th>Thời hạn</th>
                <th>Trạng thái</th>
                <th>Xác nhận</th>
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
                  <td data-label="Xác nhận">
                    {contract.terms.acceptedAt ? <span><small>Đã xác nhận<br />{formatPortalDate(contract.terms.acceptedAt, true)}</small>{contract.status === "READY_FOR_HANDOVER" && <Link className="portal-text-button" to="/customer/appointments">Đặt lịch bàn giao</Link>}</span> :
                      <button type="button" className="button-secondary payment-table-action" disabled={acceptingId === contract.id} onClick={() => accept(contract)}>{acceptingId === contract.id ? "Đang lưu…" : "Đồng ý hợp đồng"}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      {pagination}
    </section>
  );
}
