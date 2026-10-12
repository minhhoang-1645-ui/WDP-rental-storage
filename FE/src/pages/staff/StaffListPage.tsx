import { RefreshCw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { usePaginatedResource } from "../../services/usePaginatedResource";
import {
  code,
  customer,
  date,
  first,
  label,
  rows,
  recordId,
  type Row,
} from "../../components/manager/portal-data";
import {
  Empty,
  LoadState,
  PageHeader,
  Pagination,
  Status,
} from "../../components/manager/PortalUi";
import {
  staffResources,
  staffDay,
  type StaffResource,
} from "./staff-resources";
import { StaffMaintenanceReport } from "./StaffMaintenanceReport";

export function StaffListPage({ resource }: { resource: StaffResource }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const data = usePaginatedResource<Row>(`/staff/${resource}`, user?.id ?? "");
  const config = staffResources[resource];
  const search = params.get("search") ?? "",
    status = params.get("status") ?? "",
    scheduledDay =
      resource === "appointments" ? (params.get("date") ?? "") : "",
    mine = params.get("mine") === "true";
  const canAssign =
    resource === "maintenance" || resource === "support-requests";
  const items = (data.data?.items ?? []).filter(
    (row) =>
      (!status || (row.status ?? row.rentalState) === status) &&
      (!scheduledDay || staffDay(row.scheduledAt) === scheduledDay) &&
      (!mine || first(row, "assignedStaff.id") === user?.id) &&
      [
        code(row),
        first(customer(row), "fullName", "email"),
        first(row, "assignedStaff.fullName", "unit.unitCode"),
        first(row, "reservation.reference"),
        ...rows(row.contracts).map((contract) =>
          first(contract, "unit.unitCode"),
        ),
      ]
        .join(" ")
        .toLocaleLowerCase("vi")
        .includes(search.trim().toLocaleLowerCase("vi")),
  );
  const page = Math.min(
    Math.max(1, Math.floor(Number(params.get("page")) || 1)),
    Math.max(1, Math.ceil(items.length / 20)),
  );
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
  return (
    <section>
      <PageHeader title={config.title} description={config.description}>
        <button
          className="button-secondary"
          onClick={data.refresh}
          disabled={data.loading}
        >
          <RefreshCw size={16} />
          Làm mới
        </button>
      </PageHeader>
      <div className="portal-toolbar">
        <label className="field-label portal-search">
          Tìm hồ sơ
          <input
            type="search"
            placeholder="Mã hồ sơ, khách hàng, kho…"
            value={search}
            onChange={(event) => change("search", event.target.value)}
          />
        </label>
        <label className="field-label">
          Trạng thái
          <select
            value={status}
            onChange={(event) => change("status", event.target.value)}
          >
            <option value="">Tất cả</option>
            {config.statuses.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        {resource === "appointments" && (
          <label className="field-label">
            Ngày bàn giao
            <input
              type="date"
              value={scheduledDay}
              onChange={(event) => change("date", event.target.value)}
            />
          </label>
        )}
        {canAssign && (
          <label className="portal-checkbox">
            <input
              type="checkbox"
              checked={mine}
              onChange={(event) =>
                change("mine", event.target.checked ? "true" : "")
              }
            />
            Chỉ việc được giao cho tôi
          </label>
        )}
      </div>
      <LoadState
        loading={data.loading}
        error={data.error}
        retry={data.refresh}
      />
      {data.data && (
        <>
          <div className="portal-result-heading">
            <span>{items.length} hồ sơ</span>
          </div>
          {items.length ? (
            <div className="manager-table-wrap">
              <table className="manager-table">
                <thead>
                  <tr>
                    <th>Hồ sơ</th>
                    <th>Khách hàng / Kho</th>
                    {canAssign && <th>Phụ trách</th>}
                    <th>Trạng thái</th>
                    <th>Thời gian</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice((page - 1) * 20, page * 20).map((row) => (
                    <tr key={recordId(row)}>
                      <td>
                        <strong>{code(row)}</strong>
                        <small>
                          {first(
                            row,
                            "reservation.reference",
                            "storageType.name",
                          )}
                        </small>
                      </td>
                      <td>
                        {first(customer(row), "fullName") ||
                          first(row, "unit.unitCode", "storageUnit.unitCode") ||
                          "—"}
                        <small>{first(customer(row), "phone")}</small>
                      </td>
                      {canAssign && (
                        <td>
                          {first(row, "assignedStaff.fullName") ||
                            "Chưa phân công"}
                        </td>
                      )}
                      <td>
                        <Status value={row.status ?? row.rentalState} />
                      </td>
                      <td>
                        {date(
                          row.scheduledAt ??
                            row.requestedAt ??
                            row.createdAt ??
                            row.effectiveEndDate,
                          true,
                        )}
                      </td>
                      <td>
                        <Link
                          className="button-secondary"
                          to={`/staff/${resource}/${encodeURIComponent(recordId(row))}`}
                        >
                          Xem hồ sơ
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty />
          )}
          <Pagination
            page={page}
            total={items.length}
            limit={20}
            onChange={(value) => change("page", String(value))}
          />
        </>
      )}
      {resource === "maintenance" && (
        <StaffMaintenanceReport onSuccess={data.refresh} />
      )}
    </section>
  );
}
