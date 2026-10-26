import { ArrowLeft, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { useApiResource } from "../../services/useApiResource";
import {
  code,
  customer,
  date,
  first,
  label,
  rows,
  type Row,
} from "../../components/manager/portal-data";
import {
  Facts,
  LoadState,
  PageHeader,
  Status,
} from "../../components/manager/PortalUi";
import { staffResources, type StaffResource } from "./staff-resources";
import { StaffActions } from "./StaffActions";
import { WorkflowHint } from '../../components/workspace/WorkHub';
import { workflowGuide } from '../../utils/workflow-guide';

export function StaffRecordPage({ resource }: { resource: StaffResource }) {
  const { id = '' } = useParams();
  const { user } = useAuth();
  return <StaffRecord key={`${user?.id}:${resource}:${id}`} resource={resource} />;
}

function StaffRecord({ resource }: { resource: StaffResource }) {
  const { user } = useAuth(),
    { id = "" } = useParams();
  const data = useApiResource<Row>(
    `/staff/${resource}/${encodeURIComponent(id)}`,
    user?.id ?? "",
  );
  const [notice, setNotice] = useState("");
  const row = data.data;
  return (
    <section>
      <Link className="booking-back" to={`/staff/${resource}`}>
        <ArrowLeft size={16} />
        {staffResources[resource].title}
      </Link>
      {!row && (
        <PageHeader
          title={staffResources[resource].title}
          description="Thông tin hồ sơ tác nghiệp"
        />
      )}
      <LoadState
        loading={data.loading}
        error={data.error}
        retry={data.refresh}
      />
      {notice && (
        <div className="portal-success" role="status">
          {notice}
        </div>
      )}
      {row && (
        <>
          <PageHeader
            title={code(row)}
            description={staffResources[resource].description}
          >
            <Status value={row.status ?? row.rentalState} />
            <button className="button-secondary" onClick={data.refresh}>
              <RefreshCw size={16} />
              Làm mới hồ sơ
            </button>
          </PageHeader>
          <div className="manager-detail-grid">
            {workflowGuide(resource, row.status, 'staff') && <div className="workspace-full-row"><WorkflowHint>{workflowGuide(resource, row.status, 'staff')}</WorkflowHint></div>}
            <div className="manager-detail-content">
              <section className="manager-section">
                <h2>Thông tin tác nghiệp</h2>
                <Facts
                  items={[
                    ["Khách hàng", first(customer(row), "fullName")],
                    ["Số điện thoại", first(customer(row), "phone")],
                    ["Email", first(customer(row), "email")],
                    [
                      "Yêu cầu đặt kho",
                      first(
                        row,
                        "reservation.reference",
                        "reservationReference",
                      ),
                    ],
                    [
                      "Kho liên quan",
                      first(row, "unit.unitCode", "storageUnit.unitCode"),
                    ],
                    [
                      "Nhân viên phụ trách",
                      first(row, "assignedStaff.fullName"),
                    ],
                    ["Loại vấn đề", label(row.category)],
                    ["Ưu tiên", label(row.priority)],
                    ["Lịch hẹn", date(row.scheduledAt, true)],
                    ["Ngày kết thúc thuê", date(row.effectiveEndDate)],
                    ["Mô tả", first(row, "description", "note")],
                    ["Ghi chú bàn giao", first(row, "handoverNote")],
                    ["Kết quả sửa chữa", first(row, "workNote")],
                    ["Kết quả hỗ trợ", first(row, "resolutionNote")],
                    ["Lý do chuyển bộ phận phụ trách", first(row, "escalationReason")],
                  ]}
                />
              </section>
              {(rows(row.allocatedUnits).length > 0 ||
                rows(row.contracts).length > 0) && (
                <section className="manager-section">
                  <h2>Các kho trong hồ sơ</h2>
                  <div className="manager-table-wrap">
                    <table className="manager-table">
                      <thead>
                        <tr>
                          <th>Hợp đồng</th>
                          <th>Kho</th>
                          <th>Vị trí</th>
                          <th>Trạng thái vật lý</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ...rows(row.allocatedUnits),
                          ...rows(row.contracts),
                        ].map((item) => (
                          <tr key={first(item, "id", "contractCode")}>
                            <td>{first(item, "contractCode")}</td>
                            <td>{first(item, "unitCode", "unit.unitCode")}</td>
                            <td>
                              {[
                                first(item, "floor", "unit.floor"),
                                first(item, "zone", "unit.zone"),
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </td>
                            <td>
                              <Status
                                value={
                                  item.unitStatus ??
                                  (item.unit as Row | undefined)?.status
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {rows(row.inspections).length > 0 && (
                <section className="manager-section">
                  <h2>Kết quả kiểm tra từng kho</h2>
                  {rows(row.inspections).map((item) => (
                    <div
                      key={first(item, "id")}
                      className="portal-inspection-summary"
                    >
                      <h3>{first(item, "unit.unitCode")}</h3>
                      <Status value={item.result} />
                      <Facts
                        items={[
                          ["Hiện trạng", first(item, "conditionNote")],
                          ["Vấn đề", label(item.issueType)],
                          ["Mô tả", first(item, "issueNote")],
                          [
                            "Người kiểm tra",
                            first(item, "inspectedBy.fullName"),
                          ],
                          ["Thời điểm", date(item.inspectedAt, true)],
                        ]}
                      />
                    </div>
                  ))}
                </section>
              )}
              <section className="manager-section">
                <h2>Tiến trình</h2>
                <Facts
                  items={[
                    ["Tạo hồ sơ", date(row.createdAt, true)],
                    [
                      "Bắt đầu xử lý",
                      date(row.startedAt ?? row.inspectionStartedAt, true),
                    ],
                    [
                      "Hoàn tất",
                      date(
                        row.completedAt ??
                          row.resolvedAt ??
                          row.workCompletedAt,
                        true,
                      ),
                    ],
                    [
                      "Người hoàn tất",
                      first(row, "completedBy.fullName", "resolvedBy.fullName"),
                    ],
                  ]}
                />
              </section>
            </div>
            <aside>
              <StaffActions
                key={`${row.status}:${row.updatedAt}`}
                resource={resource}
                row={row}
                id={id}
                refresh={data.refresh}
                onSuccess={setNotice}
              />
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
