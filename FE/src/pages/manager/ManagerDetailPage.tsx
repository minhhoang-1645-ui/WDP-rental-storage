/* oxlint-disable react/jsx-key -- Tuple values below are rendered inside keyed fact fields and table cells, not directly as a child list. */
import { ArrowLeft, Printer, RefreshCw } from "lucide-react";
import { useState } from "react";
import { WorkflowHint } from '../../components/workspace/WorkHub';
import { workflowGuide } from '../../utils/workflow-guide';
import { useParams } from "react-router-dom";
import { OperationsLink as Link } from "../../components/manager/OperationsLink";
import { useAuth } from "../../auth/auth-context";
import { useApiResource } from "../../services/useApiResource";
import { hasDraft } from '../../services/live-events';
import {
  at,
  code,
  customer,
  date,
  first,
  label,
  money,
  object,
  rows,
  resources,
  type Row,
} from "../../components/manager/portal-data";
import {
  Empty,
  Facts,
  LoadState,
  PageHeader,
  Status,
} from "../../components/manager/PortalUi";
import { ManagerActions } from "./ManagerActions";
import { ManagerContractTransfers } from "./ManagerContractTransfers";
import { StaffActions } from '../staff/StaffActions';
import { staffResources, type StaffResource } from '../staff/staff-resources';
import { RenewalReview } from '../../components/manager/RenewalReview';

export function ManagerDetailPage({ resource }: { resource: string }) {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const config = resources[resource];
  const [notice, setNotice] = useState("");
  const data = useApiResource<Row>(
    config && id ? `/manager/${resource}/${encodeURIComponent(id)}` : null,
    user?.id ?? "",
  );
  const listPath = ["units", "customers", "reservations", "inquiries"].includes(
    resource,
  )
    ? `/manager/${resource}`
    : `/manager/operations/${resource}`;
  if (!config) return <Empty title="Không tìm thấy phân hệ" />;
  const row = data.data;
  return (
    <section>
      <Link className="booking-back" to={listPath}>
        <ArrowLeft size={16} />
        {config.title}
      </Link>
      {!row && (
        <PageHeader title={config.title} description="Thông tin hồ sơ" />
      )}
      {notice && (
        <div className="portal-success" role="status">
          {notice}
        </div>
      )}
      <LoadState
        loading={data.loading}
        error={data.error}
        retry={data.refresh}
      />
      {row && (
        <>
          <PageHeader title={code(row)} description={config.description}>
            <Status
              value={row.status ?? row.rentalState ?? row.accountStatus}
            />
            <button className="button-secondary" onClick={() => window.print()}>
              <Printer size={16} />
              In hồ sơ
            </button>
            <button
              className="button-secondary"
              aria-label="Làm mới hồ sơ"
              onClick={() => { if (hasDraft()) { setNotice('Bạn đang nhập nội dung. Hãy lưu thao tác hoặc tải lại sau khi đã đối chiếu để tránh mất nội dung.'); return; } data.refresh(); }}
            >
              <RefreshCw size={16} />
            </button>
          </PageHeader>
          <div className="manager-detail-grid">
            {workflowGuide(resource, row.status) && <div className="workspace-full-row"><WorkflowHint>{workflowGuide(resource, row.status)}</WorkflowHint></div>}
            <div className="manager-detail-content">
              {resource === 'renewals' && <RenewalReview row={row} />}
              <DetailContent row={row} resource={resource} />
              {user?.role === 'STAFF' && Object.hasOwn(staffResources, resource) && <StaffActions resource={resource as StaffResource} row={row} id={id} refresh={data.refresh} onSuccess={setNotice} />}
              {resource === "contracts" && (
                <ManagerContractTransfers
                  key={`${user?.id}:${id}:${row.updatedAt ?? ""}`}
                  contract={row}
                  identity={user?.id ?? ""}
                />
              )}
              <section className="manager-section">
                <h2>Tiến trình hồ sơ</h2>
                <div className="portal-timeline">
                  {(
                    [
                      "createdAt",
                      "requestedAt",
                      "contactedAt",
                      "confirmedAt",
                      "cancelledAt",
                      "activatedAt",
                      "startedAt",
                      "workCompletedAt",
                      "inspectionStartedAt",
                      "physicallyReturnedAt",
                      "reviewedAt",
                      "approvedAt",
                      "rejectedAt",
                      "verifiedAt",
                      "escalatedAt",
                      "resolvedAt",
                      "paidAt",
                      "refundedAt",
                      "completedAt",
                      "settledAt",
                      "updatedAt",
                    ] as const
                  )
                    .filter((key) => row[key])
                    .map((key) => (
                      <div key={key}>
                        <span>{timelineLabels[key]}</span>
                        <strong>{date(row[key], true)}</strong>
                      </div>
                    ))}
                </div>
              </section>
            </div>
            <aside className="manager-processing">
              <h2>Xử lý hồ sơ</h2>
              <ManagerActions
                key={`${resource}:${id}:${row.updatedAt ?? row.status}`}
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
const timelineLabels: Record<string, string> = {
  createdAt: "Tạo hồ sơ",
  requestedAt: "Gửi yêu cầu",
  contactedAt: "Đã liên hệ khách",
  confirmedAt: "Xác nhận",
  cancelledAt: "Đã hủy lịch",
  activatedAt: "Bắt đầu thuê",
  startedAt: "Bắt đầu xử lý",
  workCompletedAt: "Hoàn thành công việc",
  inspectionStartedAt: "Bắt đầu kiểm tra",
  physicallyReturnedAt: "Đã nhận kho",
  reviewedAt: "Đã xem xét",
  approvedAt: "Phê duyệt",
  rejectedAt: "Từ chối",
  verifiedAt: "Nghiệm thu",
  escalatedAt: "Chuyển bộ phận phụ trách",
  resolvedAt: "Giải quyết",
  paidAt: "Thanh toán đủ",
  refundedAt: "Ghi nhận hoàn tiền",
  completedAt: "Hoàn tất",
  settledAt: "Quyết toán",
  updatedAt: "Cập nhật gần nhất",
};
function DetailContent({ row, resource }: { row: Row; resource: string }) {
  const person = resource === "customers" ? row : customer(row);
  const reservation = object(row.reservation);
  const reference = first(row, "reservation.reference", "reservationReference");
  const invoices = rows(row.invoices ?? at(row, "billingSummary.invoices"));
  const unit = object(row.storageUnit ?? row.unit);
  const availability = object(row.availability);
  const quote = object(
    row.quote ??
      row.quoteSnapshot ??
      row.reservationPricing ??
      row.historicalPricing,
  );
  return (
    <>
      {first(person, "fullName") && (
        <section className="manager-section">
          <h2>
            {resource === "customers" ? "Thông tin khách hàng" : "Khách hàng"}
          </h2>
          <Facts
            items={[
              ["Họ tên", first(person, "fullName")],
              [
                "Điện thoại",
                person.phone ? (
                  <a href={`tel:${person.phone}`}>{first(person, "phone")}</a>
                ) : (
                  "Chưa cập nhật"
                ),
              ],
              [
                "Email",
                person.email ? (
                  <a href={`mailto:${person.email}`}>
                    {first(person, "email")}
                  </a>
                ) : (
                  "Chưa cập nhật"
                ),
              ],
            ]}
          />
        </section>
      )}
      <section className="manager-section">
        <h2>Thông tin hồ sơ</h2>
        <Facts
          items={[
            ...(reference
              ? [
                  [
                    "Đặt kho",
                    <Link
                      to={`/manager/reservations/${encodeURIComponent(reference)}`}
                    >
                      {reference}
                    </Link>,
                  ] as [string, React.ReactNode],
                ]
              : []),
            ...(first(
              row,
              "product.name",
              "storageType.name",
              "reservation.storageType.name",
              "unit.storageType.name",
            )
              ? [
                  [
                    "Loại kho",
                    first(
                      row,
                      "product.name",
                      "storageType.name",
                      "reservation.storageType.name",
                      "unit.storageType.name",
                    ),
                  ] as [string, React.ReactNode],
                ]
              : []),
            ...((row.quantity ?? reservation.quantity)
              ? [
                  [
                    "Số lượng",
                    `${row.quantity ?? reservation.quantity} kho`,
                  ] as [string, React.ReactNode],
                ]
              : []),
            ...(typeof row.adjacencyPreference === "boolean"
              ? ([
                  [
                    "Ưu tiên kho gần nhau",
                    row.adjacencyPreference
                      ? "Có · tùy khả dụng thực tế"
                      : "Không yêu cầu",
                  ],
                ] as Array<[string, React.ReactNode]>)
              : []),
            ...(row.source
              ? ([["Nguồn hồ sơ", label(row.source)]] as Array<
                  [string, React.ReactNode]
                >)
              : []),
            ...(row.processedBy
              ? ([["Người xử lý", first(row, "processedBy.fullName")]] as Array<
                  [string, React.ReactNode]
                >)
              : []),
            ...(row.resolutionType
              ? ([["Kết quả hỗ trợ", label(row.resolutionType)]] as Array<
                  [string, React.ReactNode]
                >)
              : []),
            ...((row.startDate ?? reservation.startDate)
              ? [
                  [
                    "Ngày bắt đầu",
                    date(row.startDate ?? reservation.startDate),
                  ] as [string, React.ReactNode],
                ]
              : []),
            ...((row.endDateExclusive ??
            row.endDate ??
            row.effectiveEndDate ??
            reservation.endDate)
              ? [
                  [
                    "Ngày kết thúc",
                    date(
                      row.effectiveEndDate ??
                        row.endDateExclusive ??
                        row.endDate ??
                        reservation.endDate,
                    ),
                  ] as [string, React.ReactNode],
                ]
              : []),
            ...(row.previousEndDate
              ? ([
                  ["Hạn hiện tại", date(row.previousEndDate)],
                  ["Gia hạn đến", date(row.requestedEndDate)],
                  ["Phương thức", label(row.paymentPlan)],
                ] as Array<[string, React.ReactNode]>)
              : []),
            ...(row.scheduledAt
              ? ([["Lịch hẹn", date(row.scheduledAt, true)]] as Array<
                  [string, React.ReactNode]
                >)
              : []),
            ...(row.priority
              ? ([
                  ["Ưu tiên", label(row.priority)],
                  ["Hạng mục", label(row.category)],
                  [
                    "Nhân viên phụ trách",
                    first(row, "assignedStaff.fullName") || "Chưa phân công",
                  ],
                ] as Array<[string, React.ReactNode]>)
              : []),
            ...(row.reason
              ? ([["Lý do", label(row.reason)]] as Array<
                  [string, React.ReactNode]
                >)
              : []),
            ...operationActors
              .filter(([field]) => first(row, `${field}.fullName`))
              .map(
                ([field, title]) =>
                  [title, first(row, `${field}.fullName`)] as [
                    string,
                    React.ReactNode,
                  ],
              ),
            ...(resource === "customers"
              ? ([
                  ["Lượt đặt kho", first(row, "reservationCount")],
                  ["Trạng thái tài khoản", label(row.accountStatus)],
                ] as Array<[string, React.ReactNode]>)
              : []),
            ...(resource === "units"
              ? ([
                  ["Kích thước", first(row, "dimensions.display")],
                  ["Điều kiện", label(row.condition)],
                  [
                    "Vị trí",
                    [
                      row.floor,
                      row.zone && `Khu ${row.zone}`,
                      row.row && `Hàng ${row.row}`,
                      row.position && `Ô ${row.position}`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Chưa cập nhật",
                  ],
                ] as Array<[string, React.ReactNode]>)
              : []),
          ]}
        />
        {[
          "subject",
          "description",
          "customerNotes",
          "note",
          "handoverNote",
          "workNote",
          "verificationNote",
          "escalationReason",
          "resolutionNote",
          "rejectionReason",
          "reviewNote",
        ]
          .filter((key) => row[key])
          .map((key) => (
            <div className="portal-note" key={key}>
              <small>{noteLabels[key]}</small>
              <p>{first(row, key)}</p>
            </div>
          ))}
      </section>
      {Object.keys(availability).length > 0 && (
        <section className="manager-section">
          <h2>Khả dụng tại lần kiểm tra gần nhất</h2>
          <p>{first(availability, "message")}</p>
          <Facts
            items={[
              [
                "Kết quả",
                availability.available === true
                  ? "Đủ kho theo kỳ thuê"
                  : "Cần xác nhận lại",
              ],
              [
                "Kỳ đã kiểm tra",
                `${date(availability.startDate)} → ${date(availability.endDateExclusive)}`,
              ],
            ]}
          />
          <small>
            Kết quả đã lưu theo hồ sơ. Khi duyệt, hệ thống kiểm tra lại toàn bộ
            kỳ thuê.
          </small>
        </section>
      )}
      {row.isOverdue === true && (
        <div className="booking-alert is-error">
          Đã quá hạn thuê. Kho vẫn đang sử dụng cho đến khi hoàn tất trả kho và
          kiểm tra.
        </div>
      )}
      {(at(row, "futureAllocationRisk.hasCurrentAllocationConflict") === true ||
        row.hasFutureAllocation === true) && (
        <div className="booking-alert">
          Kho có lịch phân bổ khác cần theo dõi.
          {first(row, "nextConfirmedAllocation.reservationReference") && (
            <p>
              {first(row, "nextConfirmedAllocation.reservationReference")} ·{" "}
              {date(at(row, "nextConfirmedAllocation.startDate"))}
            </p>
          )}
        </div>
      )}
      {Object.keys(unit).length > 0 && (
        <section className="manager-section">
          <h2>Kho vật lý</h2>
          <Facts
            items={[
              [
                "Mã kho",
                <Link
                  to={`/manager/units/${encodeURIComponent(first(unit, "id", "unitCode"))}`}
                >
                  {first(unit, "unitCode")}
                </Link>,
              ],
              [
                "Tình trạng",
                <Status value={unit.status ?? unit.physicalStatus} />,
              ],
              [
                "Vị trí",
                [unit.floor, unit.zone].filter(Boolean).join(" · ") ||
                  "Chưa cập nhật",
              ],
            ]}
          />
        </section>
      )}
      {row.fromUnit && (
        <section className="manager-section">
          <h2>Điều chuyển</h2>
          <Facts
            items={[
              [
                "Kho nguồn",
                <Link
                  to={`/manager/units/${encodeURIComponent(first(row, "fromUnit.id"))}`}
                >
                  {first(row, "fromUnit.unitCode")}
                </Link>,
              ],
              [
                "Kho đích",
                row.toUnit ? (
                  <Link
                    to={`/manager/units/${encodeURIComponent(first(row, "toUnit.id"))}`}
                  >
                    {first(row, "toUnit.unitCode")}
                  </Link>
                ) : (
                  "Chưa chọn"
                ),
              ],
              [
                "Hợp đồng",
                <Link
                  to={`/manager/operations/contracts/${encodeURIComponent(first(row, "contract.id"))}`}
                >
                  {first(row, "contract.contractCode")}
                </Link>,
              ],
            ]}
          />
        </section>
      )}
      {!row.fromUnit &&
        (row.contract || row.invoice || row.activeMaintenance) && (
          <section className="manager-section">
            <h2>Hồ sơ liên quan</h2>
            <div className="portal-actions">
              {Boolean(row.contract) && (
                <Link
                  className="button-secondary"
                  to={`/manager/operations/contracts/${encodeURIComponent(first(row, "contract.id", "contract.contractCode"))}`}
                >
                  Hợp đồng · {first(row, "contract.contractCode")}
                </Link>
              )}
              {Boolean(row.invoice) && resource !== "payments" && (
                <Link
                  className="button-secondary"
                  to={`/manager/operations/invoices/${encodeURIComponent(first(row, "invoice.id", "invoice.invoiceCode"))}`}
                >
                  Hóa đơn · {first(row, "invoice.invoiceCode")}
                </Link>
              )}
              {Boolean(row.activeMaintenance) && (
                <Link
                  className="button-secondary"
                  to={`/manager/operations/maintenance/${encodeURIComponent(first(row, "activeMaintenance.id"))}`}
                >
                  Bảo trì · {first(row, "activeMaintenance.maintenanceCode")}
                </Link>
              )}
            </div>
          </section>
        )}
      {resource === "invoices" && (
        <section className="manager-section">
          <h2>Số tiền cần thu</h2>
          <Facts
            items={[
              ["Loại hóa đơn", label(row.type)],
              [
                "Kỳ thu",
                `${date(row.billingPeriodStart)} → ${date(row.billingPeriodEnd)}`,
              ],
              ["Hạn thanh toán", date(row.dueAt)],
              ["Tiền thuê", money(row.rentalAmount)],
              ["Tiền cọc", money(row.depositAmount)],
              ["Dịch vụ bổ sung", money(row.serviceAmount)],
              ["Phí được duyệt", money(row.chargeAmount)],
              ["Tổng hóa đơn", money(row.totalAmount)],
              ["Đã thu", money(row.amountPaid)],
              ["Còn thu", money(row.balanceDue)],
            ]}
          />
          {row.isPastDue === true && (
            <div className="booking-alert is-error">
              Hóa đơn đã quá hạn thanh toán.
            </div>
          )}
        </section>
      )}
      {resource === "payments" && (
        <section className="manager-section">
          <h2>Khoản thu đã ghi nhận</h2>
          <Facts
            items={[
              ["Số tiền", money(row.amount)],
              ["Phương thức", label(row.method)],
              ["Mã tham chiếu", first(row, "reference") || "—"],
              ["Người ghi nhận", first(row, "recordedBy.fullName")],
              ["Ngày nhận", date(row.receivedAt, true)],
              [
                "Hóa đơn",
                <Link
                  to={`/manager/operations/invoices/${encodeURIComponent(first(row, "invoice.id"))}`}
                >
                  {first(row, "invoice.invoiceCode")}
                </Link>,
              ],
            ]}
          />
        </section>
      )}
      {resource === "deposit-settlements" && (
        <section className="manager-section">
          <h2>Quyết toán cọc</h2>
          <Facts
            items={[
              ["Tiền cọc", money(row.depositAmount)],
              ["Tổng phí được duyệt", money(row.totalApprovedCharges)],
              ["Khấu trừ cọc", money(row.deductionAmount)],
              ["Hoàn lại", money(row.refundAmount)],
              ["Thu thêm", money(row.outstandingAmount)],
              ["Phương thức hoàn", label(row.refundMethod)],
              ["Tham chiếu hoàn", first(row, "refundReference") || "—"],
            ]}
          />
          {Boolean(row.outstandingInvoice) && (
            <Link
              className="button-secondary"
              to={`/manager/operations/invoices/${encodeURIComponent(first(row, "outstandingInvoice.id"))}`}
            >
              Thu hóa đơn bổ sung ·{" "}
              {first(row, "outstandingInvoice.invoiceCode")}
            </Link>
          )}
        </section>
      )}
      {Object.keys(quote).length > 0 && (
        <section className="manager-section">
          <h2>Báo giá tại thời điểm đăng ký</h2>
          <Facts
            items={[
              ["Phương thức", label(quote.paymentPlan)],
              ...(typeof quote.monthlyUnitPrice === "number"
                ? [
                    ["Đơn giá tháng / kho", money(quote.monthlyUnitPrice)] as [
                      string,
                      React.ReactNode,
                    ],
                  ]
                : []),
              ...(typeof quote.discountAmount === "number"
                ? [
                    [
                      `Giảm giá (${quote.discountPercent ?? 0}%)`,
                      money(quote.discountAmount),
                    ] as [string, React.ReactNode],
                  ]
                : []),
              ["Tiền thuê toàn kỳ", money(quote.rentalAmount)],
              ["Tiền cọc", money(quote.depositAmount)],
              [
                "Tổng báo giá",
                money(
                  quote.quotedTotalAmount ??
                    quote.totalAmount ??
                    quote.grandTotal,
                ),
              ],
            ]}
          />
          <p className="manager-action-copy">
            Số tiền cần thu từng kỳ được thể hiện trên hóa đơn tương ứng.
          </p>
          {rows(quote.lineItems).map((item) => (
            <div className="portal-quote-line" key={first(item, "code")}>
              <span>
                {first(item, "label")}
                <small>{first(item, "basis")}</small>
              </span>
              <strong>{money(item.amount)}</strong>
            </div>
          ))}
        </section>
      )}
      <RelatedTable
        title="Kho được phân bổ"
        items={rows(row.allocatedUnits)}
        headers={["Kho", "Vị trí / Kỳ phân bổ", "Trạng thái"]}
        render={(item) => [
          <Link
            to={`/manager/units/${encodeURIComponent(first(item, "unitId", "unitNumber", "unitCode"))}`}
          >
            {first(item, "unitNumber", "unitCode")}
          </Link>,
          <>
            {[
              first(item, "floor"),
              first(item, "zone"),
              first(item, "row"),
              first(item, "position"),
            ]
              .filter(Boolean)
              .join(" · ")}
            <small>
              {date(item.plannedStartDate)} → {date(item.plannedEndDate)}
              {item.releasedAt ? ` · Đã trả ${date(item.releasedAt)}` : ""}
            </small>
          </>,
          <Status value={item.unitStatus ?? item.physicalStatus} />,
        ]}
      />
      <RelatedTable
        title="Hợp đồng liên quan"
        items={rows(row.contracts)}
        headers={["Hợp đồng", "Kho vật lý", "Trạng thái"]}
        render={(item) => [
          item.id || item.contractCode ? (
            <Link
              to={`/manager/operations/contracts/${encodeURIComponent(first(item, "id", "contractCode"))}`}
            >
              {first(item, "contractCode")}
            </Link>
          ) : (
            first(item, "contractCode")
          ),
          first(item, "unit.unitCode", "storageUnit.unitCode", "unitCode"),
          <Status value={item.status} />,
        ]}
      />
      <RelatedTable
        title="Hóa đơn liên quan"
        items={invoices}
        headers={["Hóa đơn", "Tổng / Còn thu", "Trạng thái"]}
        render={(item) => [
          <Link
            to={`/manager/operations/invoices/${encodeURIComponent(first(item, "id", "invoiceCode"))}`}
          >
            {first(item, "invoiceCode")}
          </Link>,
          <>
            {money(item.totalAmount)}
            <small>Còn: {money(item.balanceDue)}</small>
          </>,
          <Status value={item.status} />,
        ]}
      />
      <RelatedTable
        title="Lịch sử thanh toán"
        items={rows(row.payments)}
        headers={["Khoản thu", "Số tiền", "Tiếp nhận"]}
        render={(item) => [
          <Link
            to={`/manager/operations/payments/${encodeURIComponent(first(item, "id", "paymentCode"))}`}
          >
            {first(item, "paymentCode")}
          </Link>,
          <>
            {money(item.amount)}
            <small>{label(item.method)}</small>
          </>,
          <>
            {first(item, "recordedBy.fullName")}
            <small>{date(item.receivedAt, true)}</small>
          </>,
        ]}
      />
      <RelatedTable
        title="Kết quả kiểm tra"
        items={rows(row.inspections ?? row.physicalInspections)}
        headers={["Kho / Hợp đồng", "Kết quả", "Ghi nhận"]}
        render={(item) => [
          <>
            {first(item, "unit.unitCode")}
            <small>{first(item, "contract.contractCode")}</small>
          </>,
          <>
            <Status value={item.result} />
            <small>{item.issueType ? label(item.issueType) : ""}</small>
          </>,
          <>
            {first(item, "conditionNote")}
            <small>{first(item, "issueNote")}</small>
            {first(item, "inspectedBy.fullName") && (
              <small>Kiểm tra: {first(item, "inspectedBy.fullName")}</small>
            )}
            {item.inspectedAt ? (
              <small>{date(item.inspectedAt, true)}</small>
            ) : null}
          </>,
        ]}
      />
      <RelatedTable
        title="Phí đã được duyệt"
        items={rows(row.issues)}
        headers={["Kho", "Phân loại", "Phí / Lý do"]}
        render={(item) => [
          first(item, "unit.unitCode"),
          label(item.approvedIssueType),
          <>
            {money(item.approvedChargeAmount)}
            <small>{first(item, "reason")}</small>
          </>,
        ]}
      />
      <RelatedTable
        title="Lịch sử đặt kho"
        items={rows(row.reservations)}
        headers={["Đặt kho", "Kỳ thuê", "Trạng thái"]}
        render={(item) => [
          <Link
            to={`/manager/reservations/${encodeURIComponent(first(item, "id"))}`}
          >
            {first(item, "reference")}
            <small>
              {first(item, "storageType.name")} · {first(item, "quantity")} kho
            </small>
          </Link>,
          `${date(item.startDate)} → ${date(item.endDate)}`,
          <Status value={item.status} />,
        ]}
      />
      <RelatedTable
        title="Lịch phân bổ & lịch sử"
        items={rows(row.allocations)}
        headers={["Đặt kho", "Kỳ thuê", "Khách hàng"]}
        render={(item) => [
          <Link
            to={`/manager/reservations/${encodeURIComponent(first(item, "reservationReference"))}`}
          >
            {first(item, "reservationReference")}
          </Link>,
          <>
            {date(item.startDate)} → {date(item.endDate)}
            <small>
              {item.releasedAt
                ? `Đã trả: ${date(item.releasedAt)}`
                : "Chưa giải phóng phân bổ"}
            </small>
          </>,
          first(item, "customer.fullName"),
        ]}
      />
      {resource === "units" &&
        row.status === "OCCUPIED" &&
        !row.currentAllocation && (
          <div className="booking-alert">
            Kho vẫn đang sử dụng. Hồ sơ phân bổ có thể đã hết kỳ thuê; cần kiểm
            tra kho đang thuê và quá hạn trước khi xử lý.
          </div>
        )}
      {resource === "returns" && (
        <Link
          className="button-secondary"
          to={`/manager/operations/deposit-settlements?search=${encodeURIComponent(first(row, "returnCode"))}`}
        >
          Xem quyết toán cọc liên quan
        </Link>
      )}
    </>
  );
}
const noteLabels: Record<string, string> = {
  subject: "Tiêu đề",
  description: "Mô tả",
  customerNotes: "Ghi chú khách hàng",
  note: "Ghi chú",
  handoverNote: "Biên bản bàn giao",
  workNote: "Kết quả công việc",
  verificationNote: "Ghi chú nghiệm thu",
  escalationReason: "Lý do chuyển bộ phận phụ trách",
  resolutionNote: "Kết quả xử lý",
  rejectionReason: "Lý do từ chối",
  reviewNote: "Ghi chú duyệt",
};
const operationActors: Array<[string, string]> = [
  ["requestedBy", "Người gửi yêu cầu"],
  ["reportedBy", "Người báo sự cố"],
  ["confirmedBy", "Người xác nhận lịch"],
  ["completedBy", "Người hoàn tất nghiệp vụ"],
  ["inspectionStartedBy", "Người bắt đầu kiểm tra"],
  ["physicallyReturnedBy", "Người nhận kho trả"],
  ["approvedBy", "Người phê duyệt"],
  ["reviewedBy", "Người duyệt hồ sơ"],
  ["verifiedBy", "Người nghiệm thu"],
  ["escalatedBy", "Nhân viên chuyển quản lý"],
  ["resolvedBy", "Người giải quyết"],
  ["settledBy", "Người hoàn tất quyết toán"],
];
function RelatedTable({
  title,
  items,
  headers,
  render,
}: {
  title: string;
  items: Row[];
  headers: string[];
  render: (item: Row) => React.ReactNode[];
}) {
  if (!items.length) return null;
  return (
    <section className="manager-section">
      <h2>{title}</h2>
      <div className="manager-table-wrap">
        <table className="manager-table">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr
                key={
                  first(
                    item,
                    "id",
                    "contractCode",
                    "invoiceCode",
                    "unitCode",
                    "unitNumber",
                  ) || index
                }
              >
                {render(item).map((value, i) => (
                  <td key={headers[i]}>{value || "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
