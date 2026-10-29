import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  FileText,
  Headphones,
  RefreshCw,
  Warehouse,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { ActivitySummary } from "../../activity/ActivityCenter";
import { useActivity } from "../../activity/context";
import {
  PageHeader,
  LoadState,
  Status,
} from "../../components/manager/PortalUi";
import { money, type Row } from "../../components/manager/portal-data";
import { WorkHub } from "../../components/workspace/WorkHub";
import { useApiResource } from "../../services/useApiResource";
import { usePaginatedResource } from "../../services/usePaginatedResource";
import { useLiveRefresh } from "../../services/live-events";
import { assignmentNeedsAttention, isOverdueInvoice, managerNeedsAction } from "../../utils/work-queue";
import { activitySources } from "../../utils/activity";

export function ManagerOverviewPage() {
  const { user } = useAuth();
  const activity = useActivity();
  const summary = useApiResource<Row>(
    "/manager/dashboard/summary",
    user?.id,
    true,
  );
  const units = usePaginatedResource<Row>("/manager/units", user?.id, true);
  useLiveRefresh("/manager/*", summary.refresh);
  const refresh = () => {
    summary.refresh();
    units.refresh();
    activity.refresh();
  };
  const invoices = activity.data.invoices ?? [];
  const outstandingInvoices = invoices.filter(row => ['OPEN', 'PARTIALLY_PAID'].includes(String(row.status)) && Number(row.balanceDue) > 0);
  const overdueInvoices = outstandingInvoices.filter((row) => isOverdueInvoice(row));
  const submissions = (activity.data["payment-submissions"] ?? []).filter(
    (row) => row.status === "PENDING_VERIFICATION",
  );
  const assignments = [
    "support-requests",
    "maintenance",
    "stock-movements",
  ].flatMap((kind) =>
    (activity.data[kind] ?? []).filter((row) => assignmentNeedsAttention(kind, row)),
  );
  const available = units.data ? units.data.items.filter(row => row.status === 'AVAILABLE').length : summary.data?.availableUnits;
  const occupied = units.data ? units.data.items.filter(row => row.status === 'OCCUPIED').length : summary.data?.occupiedUnits;
  const count = (kinds: string[], value: number) =>
    activity.loading ||
    kinds.some(
      (kind) =>
        !activity.data[kind] ||
        activity.failed.includes(
          activitySources("MANAGER").find((source) => source.kind === kind)!
            .title,
        ),
    )
      ? "—"
      : value;
  const financeReady =
    Boolean(activity.data.invoices) && !activity.failed.includes("Hóa đơn");
  return (
    <section className="workspace-home">
      <PageHeader
        title="Tổng quan vận hành"
        description={`Chào ${user?.fullName ?? "bạn"}. Theo dõi cơ sở, phân công công việc và đối chiếu tài chính.`}
      >
        <button
          className="button-secondary"
          disabled={summary.loading || units.loading || activity.checking}
          onClick={refresh}
        >
          <RefreshCw size={16} />
          Làm mới
        </button>
      </PageHeader>
      <WorkHub
        title="Việc quản lý cần xử lý"
        description="Ưu tiên hồ sơ chưa có người phụ trách và các khoản cần đối chiếu."
        actions={[
          {
            title: "Phân công nhân viên",
            description:
              "Giao người phụ trách hỗ trợ, bảo trì và nhập – xuất hàng.",
            to: "/manager/assignments?assignment=attention",
            icon: Headphones,
            count: count(
              ["support-requests", "maintenance", "stock-movements"],
              assignments.length,
            ),
            tone: assignments.length ? "attention" : "normal",
          },
          {
            title: "Chờ xác nhận thanh toán",
            description: "Đối chiếu tiền thực nhận với thông báo khách gửi.",
            to: "/manager/payment-submissions",
            icon: ClipboardCheck,
            count: count(["payment-submissions"], submissions.length),
            tone: submissions.length ? "attention" : "normal",
          },
          {
            title: "Hóa đơn & công nợ",
            description: financeReady
              ? `${outstandingInvoices.length} hóa đơn còn số dư, ${overdueInvoices.length} quá hạn. Mở để đối chiếu hoặc ghi nhận thu tại cơ sở.`
              : "Xem số tiền còn phải thu và hạn thanh toán.",
            to: "/manager/operations/invoices",
            icon: WalletCards,
            count: count(["invoices"], outstandingInvoices.length),
            tone: overdueInvoices.length ? "attention" : "normal",
          },
          ...[
            ['support-requests', 'Hỗ trợ cần quyết định', '/manager/operations/support-requests?status=ESCALATED', 'Xử lý các hồ sơ nhân viên chuyển lên.'],
            ['maintenance', 'Chờ nghiệm thu bảo trì', '/manager/operations/maintenance?status=AWAITING_VERIFICATION', 'Kiểm tra kết quả sửa chữa trước khi mở lại kho.'],
            ['deposit-settlements', 'Quyết toán tiền cọc', '/manager/operations/deposit-settlements', 'Đối chiếu kiểm tra kho, công nợ và khoản hoàn.'],
            ['online-payment-reconciliations', 'Đối soát VNPay', '/manager/online-payment-reconciliations', 'Theo dõi giao dịch cần kiểm tra và hoàn tiền.'],
          ].map(([kind, title, to, description]) => { const pending = (activity.data[kind] ?? []).filter(row => managerNeedsAction(kind, row) && !assignmentNeedsAttention(kind, row)); return { title, to, description, icon: ClipboardCheck, count: count([kind], pending.length), tone: pending.length ? 'attention' as const : 'normal' as const }; }),
        ]}
      />
      <ActivitySummary />
      <LoadState
        loading={summary.loading}
        error={summary.error}
        retry={summary.refresh}
      />
      <div className="portal-metrics" aria-label="Tình hình cơ sở">
        {[
          ["Tổng kho vật lý", units.data?.total, "/manager/units"],
          ["Kho đang sử dụng", occupied, "/manager/units?status=OCCUPIED"],
          ["Kho sẵn sàng", available, "/manager/units?status=AVAILABLE"],
          [
            "Kỳ thuê quá hạn",
            summary.data?.overdueRentals,
            "/manager/operations/rentals?status=true",
          ],
        ].map(([title, value, path]) => (
          <Link className="portal-metric" key={String(title)} to={String(path)}>
            <span>{String(title)}</span>
            <strong>{typeof value === "number" ? value : "—"}</strong>
            <small>
              Xem chi tiết <ArrowRight size={14} />
            </small>
          </Link>
        ))}
      </div>
      <div className="portal-overview-grid">
        <section className="manager-section">
          <div className="portal-section-title">
            <h2>Tình trạng kho</h2>
            <Link to="/manager/units">
              Xem kho <ArrowRight size={14} />
            </Link>
          </div>
          <LoadState
            loading={units.loading}
            error={units.error}
            retry={units.refresh}
          />
          {units.data && (
            <>
              <div
                className="portal-capacity"
                role="img"
                aria-label={`${units.data.total} kho vật lý`}
              >
                {["OCCUPIED", "AVAILABLE", "RESERVED", "MAINTENANCE"].map(
                  (status) => (
                    <div
                      key={status}
                      className={`is-${status.toLowerCase()}`}
                      style={{
                        width: `${units.data!.total ? (units.data!.items.filter((row) => row.status === status).length / units.data!.total) * 100 : 0}%`,
                      }}
                    />
                  ),
                )}
              </div>
              <div className="portal-capacity-legend">
                {["OCCUPIED", "AVAILABLE", "RESERVED", "MAINTENANCE"].map(
                  (status) => (
                    <Link key={status} to={`/manager/units?status=${status}`}>
                      <Status value={status} />
                      <strong>
                        {
                          units.data!.items.filter(
                            (row) => row.status === status,
                          ).length
                        }
                      </strong>
                    </Link>
                  ),
                )}
              </div>
            </>
          )}
          <p className="manager-action-copy">
            Khả dụng cho khách đặt mới còn phụ thuộc lịch phân bổ trong toàn bộ
            kỳ thuê. Kho quá hạn vẫn được giữ đến khi khách trả thực tế.
          </p>
        </section>
        <section className="manager-section">
          <div className="portal-section-title">
            <h2>Hồ sơ & báo cáo</h2>
          </div>
          <div className="workspace-shortcuts">
            <Link to="/manager/reports">
              <BarChart3 size={20} />
              <div>
                <strong>Báo cáo vận hành</strong>
                <span>Hóa đơn, khoản thu và tình hình sử dụng kho.</span>
              </div>
              <ArrowRight size={16} />
            </Link>
            <Link to="/manager/operations/contracts">
              <FileText size={20} />
              <div>
                <strong>Hợp đồng thuê</strong>
                <span>Đối chiếu kỳ thuê, khách hàng và kho đã phân bổ.</span>
              </div>
              <ArrowRight size={16} />
            </Link>
            <Link to="/manager/operations/rentals">
              <Warehouse size={20} />
              <div>
                <strong>Kho đang thuê</strong>
                <span>Theo dõi sử dụng kho, thời hạn và công nợ.</span>
              </div>
              <ArrowRight size={16} />
            </Link>
          </div>
          <p className="manager-action-copy">
            Nhân viên tiếp nhận và xử lý yêu cầu đặt kho, tư vấn, hỗ trợ, bàn
            giao, hàng hóa, gia hạn, chuyển kho, trả kho và bảo trì.
          </p>
        </section>
      </div>
      <section className="portal-finance-strip">
        <div>
          <span>Tổng dư nợ hóa đơn</span>
          <strong>
            {financeReady
              ? money(
                  outstandingInvoices.reduce(
                    (sum, row) => sum + Number(row.balanceDue || 0),
                    0,
                  ),
                )
              : "—"}
          </strong>
          <small>
            {financeReady
              ? `${overdueInvoices.length} hóa đơn quá hạn · ${money(overdueInvoices.reduce((sum, row) => sum + Number(row.balanceDue), 0))}`
              : "Chưa tải đủ hóa đơn để tổng hợp."}
          </small>
        </div>
        <Link className="button-secondary" to="/manager/operations/invoices">
          Theo dõi công nợ <ArrowRight size={16} />
        </Link>
      </section>
    </section>
  );
}
