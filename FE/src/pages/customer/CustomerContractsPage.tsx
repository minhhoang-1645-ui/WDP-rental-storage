import { Link, useSearchParams } from 'react-router-dom';
import { useCustomerPagination } from "../../components/customer/useCustomerPagination";
import { usePaginatedResource } from "../../services/usePaginatedResource";
import { FileText, RefreshCw } from "lucide-react";
import { useState } from "react";
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
import { SignatureAgreement } from '../../components/customer/SignatureAgreement';
import { DocumentSnapshot } from '../../components/customer/DocumentSnapshot';

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
  const [acceptingId, setAcceptingId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<CustomerContract | null>(null);
  const accept = async (contract: CustomerContract, signatureImage: string) => {
    if (!user || acceptingId) return;
    setAcceptingId(contract.id); setMessage(null);
    try {
      await mutate(`/customer/contracts/${encodeURIComponent(contract.id)}/accept`, "POST", { acceptanceName: user.fullName, agreed: true, signatureImage, snapshotHash: contract.terms.snapshotHash });
      setMessage(`Đã lưu xác nhận hợp đồng ${contract.contractCode}.`);
      setSelected(null);
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
                    {contract.terms.acceptedAt ? <span><small>Đã xác nhận<br />{formatPortalDate(contract.terms.acceptedAt, true)}</small><button type="button" className="portal-text-button" onClick={() => setSelected(contract)}>Xem bản đã xác nhận</button>{contract.status === "PENDING_PAYMENT" && <Link className="portal-text-button" to="/customer/payments">Thanh toán</Link>}{contract.status === "READY_FOR_HANDOVER" && <Link className="portal-text-button" to="/customer/appointments">Đặt lịch bàn giao</Link>}</span> :
                      <button type="button" className="button-secondary payment-table-action" onClick={() => setSelected(contract)}>Xem và xác nhận</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected && <div className="customer-panel"><h2>Hợp đồng {selected.contractCode}</h2><p>Kiểm tra thông tin hợp đồng trước khi xác nhận.</p><DocumentSnapshot value={selected.terms.document} />{selected.terms.acceptedAt ? <div><p>Đã xác nhận bởi {selected.terms.acceptanceName} lúc {formatPortalDate(selected.terms.acceptedAt, true)}.</p>{selected.terms.signatureImage ? <img src={selected.terms.signatureImage} alt="Chữ ký đã xác nhận" style={{ maxWidth: '100%', width: 300 }} /> : <p>Hồ sơ xác nhận trước đây không có ảnh chữ ký.</p>}</div> : <SignatureAgreement label="Xác nhận hợp đồng" busy={Boolean(acceptingId)} onSubmit={(signature) => void accept(selected, signature)} />}<button type="button" className="button-secondary" onClick={() => setSelected(null)}>Đóng</button></div>}
        </>
      )}
      {pagination}
    </section>
  );
}
