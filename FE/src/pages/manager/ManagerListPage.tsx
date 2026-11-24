import { useApiResource } from '../../services/useApiResource';
import { DetailRow } from '../../components/workspace/DetailRow';
import { ManagerTaskTable } from '../../components/manager/ManagerTaskTable';
import { TableSkeleton } from '../../components/LoadingSkeleton';
import { isManagerTaskResource, managerResourceColumns } from './manager-task-columns';
import { CopyRecordCode } from '../../components/workspace/RecordIdentity';
import { recordIdentity } from '../../utils/record-identity';
import { internalPageSize } from '../../utils/internal-pagination';
import { isScheduledRenewalInvoice } from '../../utils/payment-state';
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Plus, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
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
  recordId,
  type Page,
  type Row,
} from "../../components/manager/portal-data";
import {
  Empty,
  LoadState,
  PageHeader,
  Pagination,
  RefreshStatus,
  Status,
} from "../../components/manager/PortalUi";
import { ManagerCreateDialog } from "./ManagerCreateDialog";
import { InventoryEditor } from './InventoryEditor';
import { isManagerReviewWorkflow, managerReviewStatus, managerReviewTitle } from '../../utils/manager-review-access';
import { normalizeSearch } from '../../utils/notification-tools';
import { StaffTaskPagination } from '../../components/workspace/StaffTaskTable';
import { StaffWorkflowTable } from '../staff/StaffWorkflowTable';
import { isStaffTableWorkflow, staffDay } from '../staff/staff-resources';
import { managerStorageLabels } from '../../utils/manager-sections';
import '../../styles/staff-appointments.css';

const appointmentViews = [
  ['upcoming', 'Sắp tới'], ['today', 'Hôm nay'], ['completed', 'Đã hoàn tất'], ['all', 'Tất cả'],
] as const;
type AppointmentView = typeof appointmentViews[number][0];

export function ManagerListPage({ resource }: { resource: string }) {
  const config = resources[resource];
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const pendingParams = useRef(params);
  useLayoutEffect(() => {
    // A delayed render can still have the preceding query during rapid filter changes.
    if (params.toString() === new URLSearchParams(window.location.search).toString()) pendingParams.current = params;
  }, [params]);
  const staffTable = user?.role === 'FACILITY_STAFF' && isStaffTableWorkflow(resource) ? resource : null;
  const staffAppointments = staffTable === 'appointments';
  const requestedView = params.get('agenda');
  const appointmentView = appointmentViews.find(([value]) => value === requestedView)?.[0];
  const [today, setToday] = useState(() => staffDay(Date.now()));
  const filterDate = staffAppointments && appointmentView === 'today' ? today : params.get('date') ?? '';
  const managerTable = user?.role === 'FACILITY_MANAGER' && isManagerTaskResource(resource) ? resource : null;
  const limit = internalPageSize(params);
  const search = params.get("search") ?? "";
  const reviewOnly = user?.role === 'FACILITY_MANAGER' && isManagerReviewWorkflow(resource) && params.get('view') === 'decision';
  const staffTransferList = user?.role === 'FACILITY_STAFF' && resource === 'transfers';
  const statuses = staffTransferList ? ['APPROVED', 'COMPLETED'] : config?.statuses ?? [];
  const suppliedStatus = staffAppointments && appointmentView === 'completed' ? 'COMPLETED' : params.get('status') ?? '';
  const status = reviewOnly ? managerReviewStatus(resource) : staffTransferList && !statuses.includes(suppliedStatus) ? '' : suppliedStatus;
  const page = Math.min(
    100000,
    Math.max(1, Math.floor(Number(params.get("page")) || 1)),
  );
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [creatingUnit, setCreatingUnit] = useState(false);
  const [unitCreated, setUnitCreated] = useState('');
  const unitTypes = useApiResource<{ items: Row[] }>(managerTable === 'units' ? '/manager/storage-types' : null, user?.id);
  const [createdMaintenance, setCreatedMaintenance] = useState<{ owner: string; row: Row }>();
  const [state, setState] = useState<{
    key: string;
    revision: number;
    data?: Page;
    error?: string;
  }>();
  const local = Boolean(
    (config?.local && !staffTransferList) ||
    (resource === "returns" && !staffTable && status === "PENDING_SETTLEMENT"),
  );
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search.trim()) query.set("search", search.trim());
  if (status) query.set(config?.filterKey ?? "status", status);
  const from = staffAppointments && !filterDate ? params.get('from') : null;
  const through = staffAppointments && !filterDate ? params.get('through') : null;
  if (staffAppointments) query.set('agenda', appointmentView === 'upcoming' ? 'upcoming' : 'all');
  if (filterDate) query.set('date', filterDate);
  if (from) query.set('from', from);
  if (through) query.set('through', through);
  for (const field of [
    "priority",
    "type",
    "storageType",
    "floor",
    "zone",
  ])
    if (params.get(field)) query.set(field, params.get(field)!);
  const oldest = managerTable === 'deposit-settlements' && params.get('sort') === 'oldest';
  const path = `/manager/${resource}${local ? "" : `?${query}`}`;
  const key = `${user?.id}:${path}:${oldest}`;
  useEffect(() => {
    if (!config) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const request = local
        ? allPages(path, controller.signal)
        : oldest ? oldestSettlementPage(path, page, limit, controller.signal) : apiRequest<Page>(path, { signal: controller.signal });
      request
        .then((data) => {
          if (!controller.signal.aborted) setState({ key, revision, data });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setState({
              key,
              revision,
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
  }, [key, path, local, config, oldest, page, limit, revision]);
  useEffect(() => {
    const refresh = () => {
      if (hasDraft()) return;
      if (staffAppointments) setToday(staffDay(Date.now()));
      setRevision((v) => v + 1);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [staffAppointments]);
  const current = state?.key === key ? state : undefined;
  const refreshing = Boolean(current && current.revision !== revision);
  let items = current?.data?.items ?? [];
  if (reviewOnly) items = items.filter(row => row.status === status);
  if (resource === "inquiries")
    items = items.filter((row) => row.requestType === "INQUIRY");
  if (local)
    items = items.filter(
      (row) =>
        (!status || row.status === status) &&
        (!search ||
          normalizeSearch(JSON.stringify(row)).includes(normalizeSearch(search))) &&
        (!params.get("date") ||
          date(row.createdAt) === date(params.get("date"))),
    );
  const total = local ? items.length : (current?.data?.total ?? 0);
  const visiblePage = local ? Math.min(page, Math.max(1, Math.ceil(total / limit))) : page;
  const visible = local ? items.slice((visiblePage - 1) * limit, visiblePage * limit) : items;
  const refresh = () => {
    if (staffAppointments) setToday(staffDay(Date.now()));
    setRevision((v) => v + 1);
  };
  useLiveRefresh(path, refresh);
  function applyParams(next: URLSearchParams) {
    pendingParams.current = next;
    setParams(next, { replace: true });
  }
  function change(name: string, value: string) {
    const next = new URLSearchParams(pendingParams.current);
    if (staffAppointments && (name === 'date' || name === 'status')) {
      if (next.get('agenda') === 'today') next.set('date', today);
      if (next.get('agenda') === 'completed') next.set('status', 'COMPLETED');
      next.delete('agenda');
    }
    if (value) next.set(name, value);
    else next.delete(name);
    if (name !== 'page') next.delete('page');
    if (name === 'date' && staffAppointments) {
      next.delete('from');
      next.delete('through');
    }
    applyParams(next);
  }
  function changeAppointmentView(view: AppointmentView) {
    const next = new URLSearchParams(pendingParams.current);
    for (const field of ['date', 'from', 'through', 'status', 'page']) next.delete(field);
    if (view === 'all') next.delete('agenda');
    else next.set('agenda', view);
    applyParams(next);
  }
  function toggleSettlementSort() {
    const next = new URLSearchParams(params);
    if (oldest) next.delete('sort');
    else next.set('sort', 'oldest');
    next.delete('page');
    setParams(next, { replace: true });
  }
  if (!config) return <Empty title="Không tìm thấy trang" />;
  const listTitle = staffTable === 'returns' ? 'Trả kho' : config.title;
  let description = !managerTable && user?.role !== 'FACILITY_STAFF' ? config.description : undefined;
  if (reviewOnly) description = 'Chỉ hiển thị hồ sơ cần quản lý quyết định. Các bước tiếp nhận và thực hiện thuộc nhân viên.';
  if (managerTable === 'units') description = managerStorageLabels.units.description;
  if (managerTable === 'payments') description = 'Các khoản đã thu và ghi nhận vào hệ thống. Thông báo chuyển khoản đang chờ xác minh chưa được tính tại đây.';
  const toolbar = <>
        <label className="field-label portal-search">
          Tìm kiếm
          <input
            type="search"
            value={search}
            maxLength={100}
            placeholder={staffTable === 'appointments' ? 'Mã lịch, mã đặt kho, khách hàng…' : staffTable === 'maintenance' ? 'Mã phiếu, kho, nội dung…' : managerTable === 'units' ? 'Mã kho…' : 'Mã hồ sơ, tên khách, kho…'}
            onChange={(event) => change("search", event.target.value)}
          />
        </label>
        {managerTable === 'units' && <label className="field-label">Loại kho
          <select value={params.get('storageType') ?? ''} onChange={event => change('storageType', event.target.value)}>
            <option value="">Tất cả</option>
            {(unitTypes.data?.items ?? []).map(type => <option key={first(type, 'id')} value={first(type, 'id')}>{first(type, 'name')}</option>)}
          </select>
        </label>}
        {config.statuses && !reviewOnly && (
          <label className="field-label">
            {resource === "payments" ? "Phương thức" : "Trạng thái"}
            <select
              value={status}
              onChange={(event) => change("status", event.target.value)}
            >
              <option value="">Tất cả</option>
              {statuses.map((value) => (
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
            {staffTable === 'returns' ? 'Ngày gửi yêu cầu' : 'Ngày'}
            <input
              type="date"
              value={filterDate}
              lang={staffAppointments ? 'vi-VN' : undefined}
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
        {[...params.keys()].some(name => !['page', 'limit'].includes(name)) && (
          <button className="button-secondary" onClick={() => {
            const next = new URLSearchParams();
            if (params.has('limit')) next.set('limit', String(limit));
            applyParams(next);
          }}>
            Xóa bộ lọc
          </button>
        )}
  </>;
  return (
    <section className={managerTable === 'units' ? 'manager-unit-list' : staffAppointments ? 'staff-appointment-list' : staffTable ? `staff-operation-list staff-operation-list-${staffTable}` : undefined}>
      {creatingUnit && <InventoryEditor kind="unit" onClose={() => setCreatingUnit(false)} onSaved={saved => { setCreatingUnit(false); setUnitCreated(first(saved, "unitNumber", "unitCode")); refresh(); }} />}
      <PageHeader title={reviewOnly ? managerReviewTitle(resource) : listTitle} description={description}>
        {resource === 'units' && user?.role === 'FACILITY_MANAGER' && <button className="button-primary" onClick={() => { setUnitCreated(''); setCreatingUnit(true); }}><Plus size={17} />Thêm kho</button>}
        {user?.role === 'FACILITY_STAFF' && resource === 'maintenance' && (
          <button type="button" className="button-primary" onClick={() => setCreating(true)}>
            <Plus size={17} /> Báo vấn đề bảo trì
          </button>
        )}
        <button
          className="button-secondary"
          onClick={refresh}
          disabled={!current || refreshing}
        >
          <RefreshCw size={16} />
          Làm mới
        </button>
      </PageHeader>
      {managerTable === 'units' && unitCreated && <p className="portal-success" role="status">Đã thêm kho {unitCreated}.</p>}
      {staffAppointments && <div className="staff-appointment-views" role="group" aria-label="Xem lịch bàn giao">
        {appointmentViews.map(([value, title]) => {
          const selected = value === (appointmentView ?? (!filterDate && !status && !from && !through ? 'all' : undefined));
          return <button key={value} type="button" className="button-secondary" aria-pressed={selected} onClick={() => changeAppointmentView(value)}>{title}</button>;
        })}
      </div>}
      {resource === 'maintenance' && createdMaintenance && createdMaintenance.owner === user?.id && <div className="portal-success" role="status">
        Đã báo vấn đề bảo trì {code(createdMaintenance.row)}.{' '}
        {first(createdMaintenance.row, 'assignedStaff.id') === user?.id
          ? <Link to={`/staff/maintenance/${encodeURIComponent(first(createdMaintenance.row, 'id'))}`}>Mở phiếu được giao</Link>
          : first(createdMaintenance.row, 'assignedStaff.id') ? 'Đã có người phụ trách.' : 'Chờ phân công.'}
      </div>}
      {staffTable === 'maintenance' && <details className="manager-section staff-table-guidance"><summary>Hướng dẫn xử lý bảo trì</summary><p>Báo sự cố tại cơ sở được cấp quyền. Chờ quản lý phân công trước khi sửa và gửi kết quả để nghiệm thu.</p></details>}
      {managerTable ? <ManagerTaskTable title={config.title} columns={managerResourceColumns(managerTable, {
        direction: oldest ? 'ascending' : 'descending', toggle: toggleSettlementSort,
      })} items={visible}
        rowDetail={row => ({ to: detailPath(managerTable, row), label: `Xem chi tiết hồ sơ ${code(row)}` })}
        rowKey={row => first(row, 'id')} loading={!current} refreshing={refreshing} error={current?.error} retry={refresh}
        page={visiblePage} limit={limit} total={total} update={(key, value) => change(key, value)} toolbar={toolbar} /> : <>
      <div className={`portal-toolbar${staffTable ? ' staff-table-toolbar' : ''}`}>{toolbar}</div>
        {from && through && <p className="portal-result-heading" role="status">Lịch từ {date(from)} đến {date(through)}</p>}
      <RefreshStatus active={refreshing} />
      <LoadState
        loading={!current}
        error={current?.error ?? ""}
        retry={refresh}
        placeholder={staffTable ? <StaffWorkflowTable resource={staffTable} title={listTitle} items={[]} loadingRows={Math.min(limit, 6)} /> : <TableSkeleton columns={['record', 'related', 'detail', 'status', 'actions']} rows={Math.min(limit, 6)} pagination />}
      />
      {current?.data && (
        <>
          {!staffTable && <div className="portal-result-heading">
            <span>
              {total.toLocaleString("vi-VN")}{" "}
              {resource === "units" ? "kho" : "hồ sơ"}
            </span>
            <small>
              {local
                ? "Tìm kiếm trên toàn bộ danh sách"
                : "Dữ liệu từ hệ thống"}
            </small>
          </div>}
          {visible.length ? staffTable ? <StaffWorkflowTable key={staffTable} resource={staffTable} title={listTitle} items={visible} /> : (
            <div className="manager-table-wrap">
              <table className="manager-table">
                <thead>
                  <tr>
                    <th>
                      {resource === "customers" ? "Khách hàng" : "Hồ sơ"}
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
                    {user?.role !== 'FACILITY_MANAGER' && <th>
                      <span className="sr-only">Mở chi tiết</span>
                    </th>}
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
            staffAppointments ? <p className="manager-section staff-appointment-empty">
              {filterDate === today ? 'Không có lịch bàn giao hôm nay.' : 'Không tìm thấy lịch bàn giao phù hợp.'}
            </p> : staffTable ? <Empty
              title={search || status || filterDate || params.get('priority') ? 'Không tìm thấy hồ sơ phù hợp' : 'Chưa có hồ sơ'}
              description={search || status || filterDate || params.get('priority') ? 'Thử đổi từ khóa hoặc bộ lọc.' : 'Hồ sơ thuộc phạm vi của bạn sẽ xuất hiện tại đây.'}
            /> : <Empty />
          )}
          {staffTable ? <StaffTaskPagination page={visiblePage} limit={limit} total={total}
            onLimitChange={value => change('limit', String(value))} onChange={value => change('page', String(value))} /> : <Pagination
            page={visiblePage}
            limit={limit}
            onLimitChange={value => change("limit", String(value))}
            total={total}
            onChange={(v) => change("page", String(v))}
          />}
        </>
      )}
      </>}
      {creating && (
        <ManagerCreateDialog
          onClose={() => setCreating(false)}
          onSuccess={created => {
            setCreating(false);
            refresh();
            if (resource === 'maintenance') setCreatedMaintenance({ owner: user?.id ?? '', row: created });
          }}
        />
      )}
    </section>
  );
}
async function oldestSettlementPage(path: string, page: number, limit: number, signal: AbortSignal): Promise<Page> {
  const [endpoint, search] = path.split('?');
  const params = new URLSearchParams(search);
  const load = (page: number) => {
    params.set('page', String(page));
    return apiRequest<Page>(endpoint + '?' + params, { signal });
  };
  const firstPage = await load(1);
  const end = Math.max(0, firstPage.total - (page - 1) * limit);
  const start = Math.max(0, end - limit);
  if (end === start) return { ...firstPage, page, items: [] };
  const firstIndex = Math.floor(start / limit) + 1;
  const lastIndex = Math.ceil(end / limit);
  const indices = firstIndex === lastIndex ? [firstIndex] : [firstIndex, lastIndex];
  const pages = await Promise.all(indices.map(index => index === 1 ? firstPage : load(index)));
  const offset = (firstIndex - 1) * limit;
  return { ...firstPage, page, items: pages.flatMap(result => result.items).slice(start - offset, end - offset).reverse() };
}

function ListRow({ resource, row }: { resource: string; row: Row }) {
  const person = customer(row);
  const { user } = useAuth();
  const id = recordId(row);
  const to = user?.role === 'FACILITY_STAFF' ? `/staff/${resource}/${encodeURIComponent(id)}` : detailPath(resource, row);
  const identity = recordIdentity(row, resource);
  const recognizable = ['reservations', 'inquiries', 'contracts', 'invoices', 'appointments', 'renewals', 'returns', 'transfers', 'rentals'].includes(resource);
  const needsStaff = resource === 'reservations' && user?.role === 'FACILITY_STAFF' && row.status === 'PENDING';
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
    <DetailRow detail={id ? { to, label: `Xem chi tiết hồ sơ ${code(row)}` } : undefined}>
      <td>
        <Link className="portal-record-link" to={to}>
          {recognizable ? identity.person || identity.title : code(row)}
        </Link>
        {recognizable && <CopyRecordCode value={code(row)} />}
        <small>
          {resource === "customers"
            ? first(row, "phone")
            : date(
                row.createdAt ??
                  row.scheduledAt ??
                  row.receivedAt ??
                  row.requestedAt ??
                  row.issuedAt ??
                  row.createdAt,
                ['appointments', 'reservations', 'inquiries'].includes(resource),
              )}
        </small>
      </td>
      <td>
        <strong>{recognizable ? identity.title : information || "—"}</strong>
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
            <small>{first(row, 'reservation.reference')} · {(row.breakdown as { units: unknown[] } | null)?.units.length ?? first(row, 'reservation.quantity')} kho</small>
            <small>Đã thu {money(row.amountPaid)}</small>
            <small>{Number(row.balanceDue) > 0 && isScheduledRenewalInvoice(row) ? "Chưa đến kỳ" : `Còn thu: ${money(row.balanceDue)}`}</small>
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
            <strong>Hoàn cọc: {money(row.refundAmount)}</strong>
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
            <strong>{rows(row.contracts).map(contract => first(contract, 'unitCode')).filter(Boolean).join(', ')}</strong>
            <span>
              {date(row.previousEndDate)} → {date(row.requestedEndDate)}
            </span>
            <small>
              {first(row, "termMonths")} tháng · {label(row.paymentPlan)}
            </small>
          </>
        ) : resource === "returns" ? (
          <>
            <strong>{rows(row.inspections).map(item => first(item, 'unit.unitCode')).join(', ')}</strong>
            <small>{rows(row.inspections).map(item => first(item, 'contract.contractCode')).join(', ')}</small>
            <small>{row.timing === 'EARLY' ? 'Trả trước hạn' : 'Trả từ ngày hết hạn'} · Hạn {date(first(row, 'reservation.effectiveEndDate'))}</small>
            <small>
              Kiểm tra {rows(row.inspections).filter(item => item.result !== 'PENDING').length}/{rows(row.inspections).length}{row.settlementStatus ? ` · ${label(row.settlementStatus)}` : ''}
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
        {needsStaff && <small className="record-attention">Nhân viên kiểm tra ngoại lệ</small>}
      </td>
      {user?.role !== 'FACILITY_MANAGER' && <td>
        <Link
          className="manager-open"
          aria-label={`Mở ${code(row)}`}
          to={to}
        >
          <span>Xem chi tiết</span><ArrowRight size={17} />
        </Link>
      </td>}
    </DetailRow>
  );
}
