import { useEffect, useState } from "react";
import { ArrowRight, Plus, RefreshCw } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { OperationsLink as Link } from "../../components/manager/OperationsLink";
import { useAuth } from "../../auth/auth-context";
import { apiRequest } from "../../services/api";
import { allPages } from "../../services/portal";
import { hasDraft, useLiveRefresh } from '../../services/live-events';
import {
  code,
  customer,
  date,
  detailPath,
  first,
  label,
  money,
  object,
  rows,
  resources,
  type Page,
  type Row,
} from "../../components/manager/portal-data";
import {
  Empty,
  LoadState,
  PageHeader,
  Pagination,
  Status,
} from "../../components/manager/PortalUi";
import { ManagerCreateDialog } from "./ManagerCreateDialog";
import { TransferRequests } from '../../components/manager/TransferRequests';
import { isManagerReviewWorkflow, managerReviewStatus, managerReviewTitle } from '../../utils/manager-review-access';

export function ManagerListPage({ resource }: { resource: string }) {
  const config = resources[resource];
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const reviewOnly = user?.role === 'MANAGER' && isManagerReviewWorkflow(resource);
  const status = reviewOnly ? managerReviewStatus(resource) : params.get("status") ?? "";
  const page = Math.min(
    100000,
    Math.max(1, Math.floor(Number(params.get("page")) || 1)),
  );
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [transferSource, setTransferSource] = useState<Row>();
  const [createdMaintenance, setCreatedMaintenance] = useState<{ owner: string; row: Row }>();
  const [state, setState] = useState<{
    key: string;
    data?: Page;
    error?: string;
  }>();
  const local = Boolean(
    config?.local ||
    (resource === "returns" && status === "PENDING_SETTLEMENT"),
  );
  const query = new URLSearchParams({ page: String(page), limit: "20" });
  if (search.trim()) query.set("search", search.trim());
  if (status) query.set(config?.filterKey ?? "status", status);
  for (const field of [
    "priority",
    "type",
    "date",
    "storageType",
    "floor",
    "zone",
  ])
    if (params.get(field)) query.set(field, params.get(field)!);
  const path = `/manager/${resource}${local ? "" : `?${query}`}`;
  const key = `${user?.id}:${path}:${revision}`;
  useEffect(() => {
    if (!config) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const request = local
        ? allPages(path, controller.signal)
        : apiRequest<Page>(path, { signal: controller.signal });
      request
        .then((data) => {
          if (!controller.signal.aborted) setState({ key, data });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setState({
              key,
              error:
                error instanceof Error
                  ? error.message
                  : "Không thể tải dữ liệu.",
            });
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, path, local, config]);
  useEffect(() => {
    const refresh = () => { if (!hasDraft()) setRevision((v) => v + 1); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  const current = state?.key === key ? state : undefined;
  let items = current?.data?.items ?? [];
  if (reviewOnly) items = items.filter(row => row.status === status);
  if (resource === "inquiries")
    items = items.filter((row) => row.requestType === "INQUIRY");
  if (local)
    items = items.filter(
      (row) =>
        (!status || row.status === status) &&
        (!search ||
          JSON.stringify(row)
            .toLocaleLowerCase("vi")
            .includes(search.trim().toLocaleLowerCase("vi"))) &&
        (!params.get("date") ||
          date(row.createdAt) === date(params.get("date"))),
    );
  const total = local ? items.length : (current?.data?.total ?? 0);
  const visible = local ? items.slice((page - 1) * 20, page * 20) : items;
  const refresh = () => setRevision((v) => v + 1);
  useLiveRefresh(path, refresh);
  const change = (name: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(name, value);
        else next.delete(name);
        if (name !== "page") next.delete("page");
        return next;
      },
      { replace: true },
    );
  if (!config) return <Empty title="Không tìm thấy phân hệ" />;
  return (
    <section>
      <PageHeader title={reviewOnly ? managerReviewTitle(resource) : config.title} description={reviewOnly ? 'Chỉ hiển thị hồ sơ cần quản lý quyết định. Các bước tiếp nhận và thực hiện thuộc nhân viên.' : config.description}>
        {user?.role === 'STAFF' && ["maintenance", "transfers"].includes(resource) && (
          <button className="button-primary" onClick={() => setCreating(true)}>
            <Plus size={17} />
            {resource === "maintenance" ? "Tạo bảo trì" : "Tạo chuyển kho"}
          </button>
        )}
        <button
          className="button-secondary"
          onClick={refresh}
          disabled={!current}
        >
          <RefreshCw size={16} />
          Làm mới
        </button>
      </PageHeader>
      {resource === 'maintenance' && createdMaintenance && createdMaintenance.owner === user?.id && <section className="manager-section" role="status"><h2>Đã tạo phiếu bảo trì {code(createdMaintenance.row)}</h2><p>Quản lý sẽ phân công nhân viên phụ trách. Nhân viên được giao bắt đầu sửa chữa, gửi kết quả rồi nghiệm thu; kho được giữ ở trạng thái bảo trì cho đến khi hoàn tất.</p><Link className="button-secondary" to={`/manager/operations/maintenance/${encodeURIComponent(first(createdMaintenance.row, 'id'))}`}>Mở phiếu bảo trì vừa tạo</Link></section>}
      {resource === 'maintenance' && user?.role === 'STAFF' && <section className="manager-section"><h2>Bảo trì đúng tình trạng kho</h2><p>Kho trống: tạo phiếu bảo trì, phân công, sửa chữa và nghiệm thu. Kho đang cho thuê: tiếp nhận sự cố từ khách; nếu cần giải phóng kho để sửa, xử lý chuyển kho trước.</p><div className="portal-actions"><Link className="button-secondary" to="/manager/operations/rentals">Tra cứu kho đang thuê</Link><Link className="button-secondary" to="/manager/operations/support-requests">Yêu cầu sự cố</Link></div></section>}
      {resource === 'transfers' && user?.role === 'STAFF' && <TransferRequests revision={revision} onCreate={row => { setTransferSource(row); setCreating(true); }} />}
      <div className="portal-toolbar">
        <label className="field-label portal-search">
          Tìm kiếm
          <input
            type="search"
            value={search}
            maxLength={100}
            placeholder="Mã hồ sơ, tên khách, kho…"
            onChange={(event) => change("search", event.target.value)}
          />
        </label>
        {config.statuses && !reviewOnly && (
          <label className="field-label">
            Trạng thái
            <select
              value={status}
              onChange={(event) => change("status", event.target.value)}
            >
              <option value="">Tất cả</option>
              {config.statuses.map((value) => (
                <option key={value} value={value}>
                  {resource === "rentals"
                    ? value === "true"
                      ? "Quá hạn"
                      : "Trong hạn"
                    : label(value)}
                </option>
              ))}
            </select>
          </label>
        )}
        {["maintenance", "support-requests"].includes(resource) && (
          <label className="field-label">
            Ưu tiên
            <select
              value={params.get("priority") ?? ""}
              onChange={(event) => change("priority", event.target.value)}
            >
              <option value="">Tất cả</option>
              {["LOW", "MEDIUM", "HIGH"].map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
        )}
        {resource === "invoices" && (
          <label className="field-label">
            Loại hóa đơn
            <select
              value={params.get("type") ?? ""}
              onChange={(event) => change("type", event.target.value)}
            >
              <option value="">Tất cả</option>
              {["INITIAL", "RECURRING", "RENEWAL", "SETTLEMENT"].map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
        )}
        {["appointments", "returns"].includes(resource) && (
          <label className="field-label">
            Ngày
            <input
              type="date"
              value={params.get("date") ?? ""}
              onChange={(event) => change("date", event.target.value)}
            />
          </label>
        )}
        {resource === "units" && (
          <>
            <label className="field-label">
              Tầng
              <input
                value={params.get("floor") ?? ""}
                placeholder="Tất cả"
                onChange={(event) => change("floor", event.target.value)}
              />
            </label>
            <label className="field-label">
              Khu vực
              <input
                value={params.get("zone") ?? ""}
                placeholder="Tất cả"
                onChange={(event) => change("zone", event.target.value)}
              />
            </label>
          </>
        )}
        {params.size > 0 && (
          <button className="button-secondary" onClick={() => setParams({})}>
            Xóa bộ lọc
          </button>
        )}
      </div>
      <LoadState
        loading={!current}
        error={current?.error ?? ""}
        retry={refresh}
      />
      {current?.data && (
        <>
          <div className="portal-result-heading">
            <span>
              {total.toLocaleString("vi-VN")}{" "}
              {resource === "units" ? "kho" : "hồ sơ"}
            </span>
            <small>
              {local
                ? "Tìm kiếm trên toàn bộ danh sách"
                : "Dữ liệu từ hệ thống"}
            </small>
          </div>
          {visible.length ? (
            <div className="manager-table-wrap">
              <table className="manager-table">
                <thead>
                  <tr>
                    <th>
                      {resource === "customers" ? "Khách hàng" : "Mã hồ sơ"}
                    </th>
                    <th>
                      {["reservations", "inquiries"].includes(resource)
                        ? "Nhu cầu thuê"
                        : resource === "units"
                          ? "Vị trí & loại kho"
                          : "Thông tin liên quan"}
                    </th>
                    <th>
                      {["invoices", "payments", "deposit-settlements"].includes(
                        resource,
                      )
                        ? "Số tiền"
                        : "Thời gian / Chi tiết"}
                    </th>
                    <th>Trạng thái</th>
                    <th>
                      <span className="sr-only">Mở chi tiết</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <ListRow
                      key={first(row, "id", "reservationId")}
                      resource={resource}
                      row={row}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty />
          )}
          <Pagination
            page={page}
            limit={20}
            total={total}
            onChange={(v) => change("page", String(v))}
          />
        </>
      )}
      {creating && (
        <ManagerCreateDialog
          resource={resource}
          source={transferSource}
          onClose={() => { setCreating(false); setTransferSource(undefined); }}
          onSuccess={created => {
            setCreating(false);
            setTransferSource(undefined);
            refresh();
            if (resource === 'maintenance') setCreatedMaintenance({ owner: user?.id ?? '', row: created });
            if (resource === 'transfers' && user?.role === 'STAFF' && first(created, 'id')) navigate(`/staff/transfers/${encodeURIComponent(first(created, 'id'))}`);
          }}
        />
      )}
    </section>
  );
}
function ListRow({ resource, row }: { resource: string; row: Row }) {
  const person = customer(row);
  const information =
    resource === "units"
      ? first(row, "storageType.name")
      : resource === "customers"
        ? first(row, "email")
        : first(person, "fullName") ||
          first(
            row,
            "subject",
            "unit.unitCode",
            "fromUnit.unitCode",
            "reservation.reference",
          );
  return (
    <tr>
      <td>
        <Link className="portal-record-link" to={detailPath(resource, row)}>
          {code(row)}
        </Link>
        <small>
          {resource === "customers"
            ? first(row, "phone")
            : date(
                row.scheduledAt ??
                  row.receivedAt ??
                  row.requestedAt ??
                  row.issuedAt ??
                  row.createdAt,
                resource === "appointments",
              )}
        </small>
      </td>
      <td>
        <strong>{information || "—"}</strong>
        <small>
          {resource === "units"
            ? [
                row.floor,
                row.zone && `Khu ${row.zone}`,
                row.row && `Hàng ${row.row}`,
                row.position && `Ô ${row.position}`,
              ]
                .filter(Boolean)
                .join(" · ")
            : resource === "customers"
              ? first(row, "latestReservation.reference") || "Chưa đặt kho"
              : [
                  first(person, "phone"),
                  first(
                    row,
                    "product.name",
                    "storageType.name",
                    "reservation.storageType.name",
                    "unit.unitCode",
                    "reservation.reference",
                    "invoice.invoiceCode",
                  ),
                ]
                  .filter(Boolean)
                  .join(" · ")}
        </small>
        {["maintenance", "support-requests"].includes(resource) && (
          <small>
            {label(row.category)} · Ưu tiên {label(row.priority)}
          </small>
        )}
      </td>
      <td>
        {resource === "invoices" ? (
          <>
            <strong>{money(row.totalAmount)}</strong>
            <small>Còn thu: {money(row.balanceDue)}</small>
            {row.isPastDue === true && <Status value="OVERDUE" />}
          </>
        ) : resource === "payments" ? (
          <>
            <strong>{money(row.amount)}</strong>
            <small>
              {label(row.method)} · {first(row, "reference")}
            </small>
          </>
        ) : resource === "deposit-settlements" ? (
          <>
            <strong>Hoàn: {money(row.refundAmount)}</strong>
            <small>
              Cọc: {money(row.depositAmount)} · Khấu trừ:{" "}
              {money(row.deductionAmount)}
            </small>
          </>
        ) : resource === "customers" ? (
          `${first(row, "reservationCount")} lượt đặt`
        ) : resource === "units" ? (
          <>
            <span>
              {first(row, "allocationSummary.current.customer.fullName") ||
                (row.status === "OCCUPIED"
                  ? "Kho vẫn đang sử dụng"
                  : "Chưa có phân bổ hiện tại")}
            </span>
            <small>
              {rows(object(row.allocationSummary).future).length} lịch đặt trước
            </small>
          </>
        ) : resource === "transfers" ? (
          <>
            <span>
              {first(row, "fromUnit.unitCode")} →{" "}
              {first(row, "toUnit.unitCode") || "Chưa chọn kho đích"}
            </span>
            <small>{label(row.reason)}</small>
          </>
        ) : resource === "rentals" ? (
          <>
            <span>Hết hạn: {date(row.effectiveEndDate)}</span>
            <small>
              {rows(row.contracts)
                .map((item) => first(item, "unit.unitCode"))
                .join(", ")}
            </small>
          </>
        ) : resource === "renewals" ? (
          <>
            <span>
              {date(row.previousEndDate)} → {date(row.requestedEndDate)}
            </span>
            <small>
              {first(row, "termMonths")} tháng · {label(row.paymentPlan)}
            </small>
          </>
        ) : resource === "returns" ? (
          <>
            <span>
              {first(row, "inspectionSummary.passed") || "0"} đạt /{" "}
              {first(row, "inspectionSummary.total") || "0"} kho
            </span>
            <small>
              {first(row, "inspectionSummary.issues") || "0"} vấn đề ·{" "}
              {label(row.settlementStatus)}
            </small>
          </>
        ) : (
          <>
            <span>
              {date(
                row.startDate ?? row.scheduledAt ?? row.createdAt,
                resource === "appointments",
              )}
              {(row.endDateExclusive ?? row.endDate)
                ? ` → ${date(row.endDateExclusive ?? row.endDate)}`
                : ""}
            </span>
            <small>
              {row.quantity
                ? `${row.quantity} kho`
                : first(row, "description", "subject")}
            </small>
          </>
        )}
      </td>
      <td>
        <Status value={row.status ?? row.rentalState ?? row.accountStatus} />
      </td>
      <td>
        <Link
          className="manager-open"
          aria-label={`Mở ${code(row)}`}
          to={detailPath(resource, row)}
        >
          <ArrowRight size={17} />
        </Link>
      </td>
    </tr>
  );
}
