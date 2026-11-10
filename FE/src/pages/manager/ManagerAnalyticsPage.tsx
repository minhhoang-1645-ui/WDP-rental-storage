export { ManagerReportRelease as ManagerAnalyticsPage } from './ManagerReportRelease';
import { isOverdueInvoice } from "../../utils/work-queue";
import { Download, RefreshCw } from "lucide-react";
import { useState } from "react";
import {
  buildReport,
  reportMoney as money,
  reportBucketLabel,
  reportDay,
  reportRange,
  reportType,
  type ReportGroup,
  type ReportPeriod,
} from "../../utils/reporting";
import { ReportCharts } from "../../components/manager/ReportCharts";
import { usePortalSnapshot } from "../../services/usePortalSnapshot";
import {
  code,
  first,
  label,
  type Row,
} from "../../components/manager/portal-data";
import {
  LoadState,
  PageHeader,
  Status,
} from "../../components/manager/PortalUi";

function sum(items: Row[], field: string) {
  return items.reduce((value, row) => value + (typeof row[field] === 'number' && Number.isSafeInteger(row[field]) && row[field] >= 0 ? row[field] : Number.NaN), 0);
}
export function LegacyManagerAnalyticsPage() {
  const { data, loading, error, refresh } = usePortalSnapshot();
  const [from, setFrom] = useState(
    () => reportRange("month", reportDay(new Date().toISOString())).from,
  );
  const [to, setTo] = useState(
    () => reportRange("month", reportDay(new Date().toISOString())).to,
  );
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [group, setGroup] = useState<ReportGroup>("month");
  const [typeId, setTypeId] = useState("");
  const report = buildReport(
    data?.invoices.items ?? [],
    data?.payments.items ?? [],
    data?.reservations.items ?? [],
    { from, to, group, typeId },
  );
  const invoices = report.invoices,
    payments = report.payments,
    reservations = report.bookings;
  const voidCount = report.voidCount,
    billed = report.total,
    paid = report.paid,
    outstanding = report.debt;
  const overdue = invoices.filter((row) => isOverdueInvoice(row));
  const invalidRange = Boolean(from && to && from > to);
  const types = [
    ...new Map(
      [
        ...(data?.units.items ?? []),
        ...(data?.invoices.items ?? []),
        ...(data?.reservations.items ?? []),
      ].map((row) => {
        const type = reportType(row);
        return [type.id, type] as const;
      }),
    ).values(),
  ];
  const units = (data?.units.items ?? []).filter(
    (row) => !typeId || reportType(row).id === typeId,
  );
  const choosePeriod = (value: ReportPeriod) => {
    setPeriod(value);
    const range = reportRange(value, reportDay(new Date().toISOString()));
    setFrom(range.from);
    setTo(range.to);
    if (value !== "all" && value !== "custom") setGroup(value);
  };
  const exportCsv = () => {
    const escape = (value: unknown) => {
      const text = String(value ?? "");
      return (
        '"' +
        (/^[=+@\-\t\r]/.test(text) ? "'" : "") +
        text.replaceAll('"', '""') +
        '"'
      );
    };
    const output = [
      [
        "Mã hóa đơn",
        "Loại",
        "Loại kho",
        "Tiền thuê VND",
        "Tiền cọc VND",
        "Dịch vụ VND",
        "Phí khác VND",
        "Khách hàng",
        "Ngày phát hành",
        "Trạng thái",
        "Tổng tiền VND",
        "Đã thu VND",
        "Còn thu VND",
      ],
      ...invoices.map((row) => [
        code(row),
        label(row.type),
        first(row, "reservation.storageType.name"),
        row.rentalAmount,
        row.depositAmount,
        row.serviceAmount,
        row.chargeAmount,
        first(row, "reservation.customer.fullName"),
        row.issuedAt,
        label(row.status),
        row.totalAmount,
        row.amountPaid,
        row.balanceDue,
      ]),
    ]
      .map((row) => row.map(escape).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + output], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `nestbox-hoa-don-${from || "tat-ca"}-${to || "hien-tai"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section>
      <PageHeader
        title="Báo cáo vận hành"
        description="Tổng hợp toàn bộ trang dữ liệu hóa đơn, khoản thu và kho của cơ sở."
      >
        <button
          className="button-secondary"
          onClick={exportCsv}
          disabled={!data || loading || invalidRange}
        >
          <Download size={16} />
          Xuất hóa đơn CSV
        </button>
        <button
          className="button-secondary"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Làm mới
        </button>
      </PageHeader>
      <div
        className="report-period-buttons"
        role="group"
        aria-label="Chọn nhanh thời gian"
      >
        {(
          [
            ["day", "Hôm nay"],
            ["week", "Tuần này"],
            ["month", "Tháng này"],
            ["year", "Năm nay"],
            ["all", "Tất cả"],
          ] as const
        ).map(([value, title]) => (
          <button
            className="button-secondary"
            type="button"
            aria-pressed={period === value}
            key={value}
            onClick={() => choosePeriod(value)}
          >
            {title}
          </button>
        ))}
      </div>
      <div className="portal-toolbar">
        <label className="field-label">
          Gom biểu đồ theo
          <select
            aria-label="Gom biểu đồ theo"
            value={group}
            onChange={(event) => setGroup(event.target.value as ReportGroup)}
          >
            <option value="day">Ngày</option>
            <option value="week">Tuần (thứ Hai–Chủ nhật)</option>
            <option value="month">Tháng</option>
            <option value="year">Năm</option>
          </select>
        </label>
        <label className="field-label">
          Loại kho
          <select
            aria-label="Lọc loại kho báo cáo"
            value={typeId}
            onChange={(event) => setTypeId(event.target.value)}
          >
            <option value="">Tất cả loại kho</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Từ ngày
          <input
            type="date"
            max={to || undefined}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPeriod("custom");
            }}
          />
        </label>
        <label className="field-label">
          Đến ngày
          <input
            type="date"
            min={from || undefined}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPeriod("custom");
            }}
          />
        </label>
        <button
          className="button-secondary"
          onClick={() => {
            setPeriod("all");
            setFrom("");
            setTo("");
          }}
        >
          Toàn bộ thời gian
        </button>
      </div>
      <LoadState loading={loading} error={error} retry={refresh} />
      {!invalidRange && <p className="portal-report-note">Thời gian đang xem: {from ? reportBucketLabel(from, 'day') : 'Không giới hạn ngày bắt đầu'} – {to ? reportBucketLabel(to, 'day') : 'Không giới hạn ngày kết thúc'}. Theo giờ Việt Nam (UTC+7).</p>}
      {invalidRange && (
        <p className="booking-alert is-error" role="alert">
          Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.
        </p>
      )}
      {data && !invalidRange && (
        <>
          {report.missingAmounts + report.missingPayments > 0 && (
            <p role="alert" className="booking-alert is-error">
              Có {report.missingAmounts} hóa đơn và {report.missingPayments}{" "}
              khoản thu thiếu số tiền hợp lệ. Chỉ số liên quan sẽ ghi “Chưa đủ
              số liệu”; hãy kiểm tra hồ sơ trước khi sử dụng báo cáo.
            </p>
          )}
          <div className="portal-metrics">
            <article className="portal-metric">
              <span>Tiền thuê trên hóa đơn</span>
              <strong>{money(report.rent)}</strong>
              <small>Không gồm cọc, dịch vụ hoặc phí</small>
            </article>
            <article className="portal-metric">
              <span>Tiền cọc trên hóa đơn</span>
              <strong>{money(report.deposit)}</strong>
              <small>Để quyết toán khi trả kho, không phải tiền thuê</small>
            </article>
            <article className="portal-metric">
              <span>Hóa đơn phát hành trong kỳ</span>
              <strong>{money(billed)}</strong>
              <small>{invoices.length} hóa đơn</small>
            </article>
            <article className="portal-metric">
              <span>Đã thu cho hóa đơn trong kỳ</span>
              <strong>{money(paid)}</strong>
              <small>
                {Number.isFinite(billed) && Number.isFinite(paid)
                  ? billed
                    ? Math.round((paid / billed) * 100)
                    : 0
                  : "—"}
                % giá trị hóa đơn
              </small>
            </article>
            <article className="portal-metric">
              <span>Còn lại trên các hóa đơn</span>
              <strong>{money(outstanding)}</strong>
              <small>Gồm cả các kỳ chưa đến hạn trả</small>
            </article>
            <article className="portal-metric">
              <span>Tiền thực nhận trong kỳ</span>
              <strong>{money(report.received)}</strong>
              <small>{payments.length} khoản thu</small>
            </article>
            <article className="portal-metric">
              <span>Đã quá hạn, chưa trả</span>
              <strong>{money(sum(overdue, "balanceDue"))}</strong>
              <small>{overdue.length} hóa đơn trong bộ lọc hiện tại</small>
            </article>
          </div>
          <p className="portal-report-note">
            Bỏ qua {voidCount} hóa đơn đã hủy. Hóa đơn lọc theo ngày phát hành;
            khoản thu lọc theo ngày tiếp nhận. Số tiền bao gồm tiền thuê, cọc và
            phí được duyệt. Tiền hoàn cọc không được trừ trong các chỉ số này.
          </p>
          <section className="manager-section">
            <h2>Cách đọc báo cáo</h2>
            <p>
              Giá trị hóa đơn = tiền thuê + tiền cọc + dịch vụ + khoản phí được
              duyệt. Đã thu là tổng tiền được phân bổ cho các hóa đơn đã chọn;
              còn lại là số chưa được thanh toán ở thời điểm tải báo cáo, gồm cả
              hóa đơn kỳ sau chưa đến hạn. Mục “Đã quá hạn, chưa trả” mới chỉ
              lấy các hóa đơn đã qua hạn thanh toán.
            </p>
            <p>
              Khoản thu nhận trong kỳ lọc theo ngày nhận tiền nên có thể khác số
              đã thu cho hóa đơn phát hành trong kỳ. Tiền cọc không phải doanh
              thu thuê kho. Báo cáo này không tính lợi nhuận hay dự báo.
            </p>
            <p>
              Nguồn: hóa đơn, khoản thu và danh sách kho. Dữ liệu tải lúc{" "}
              {new Date(data.asOf).toLocaleString("vi-VN", {
                timeZone: "Asia/Bangkok",
              })}
              .
            </p>
          </section>
          <ReportCharts report={report} group={group} units={units} />
          <div className="portal-overview-grid">
            <section className="manager-section">
              <h2>Cơ cấu kho hiện tại</h2>
              <div className="manager-table-wrap">
                <table className="manager-table">
                  <thead>
                    <tr>
                      <th>Loại kho</th>
                      <th>Tổng</th>
                      <th>Sẵn sàng</th>
                      <th>Đang dùng</th>
                      <th>Giữ kho / Bảo trì</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...new Set(
                        units.map((row) => first(row, "storageType.name")),
                      ),
                    ].map((name) => {
                      const group = units.filter(
                        (row) => first(row, "storageType.name") === name,
                      );
                      return (
                        <tr key={name}>
                          <td>
                            <strong>{name}</strong>
                          </td>
                          <td>{group.length}</td>
                          <td>
                            {
                              group.filter((row) => row.status === "AVAILABLE")
                                .length
                            }
                          </td>
                          <td>
                            {
                              group.filter((row) => row.status === "OCCUPIED")
                                .length
                            }
                          </td>
                          <td>
                            {
                              group.filter((row) => row.status === "RESERVED")
                                .length
                            }{" "}
                            /{" "}
                            {
                              group.filter(
                                (row) => row.status === "MAINTENANCE",
                              ).length
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="manager-section">
              <h2>Đặt kho trong kỳ ({reservations.length})</h2>
              <div className="portal-stat-list">
                {[
                  "PENDING",
                  "CONFIRMED",
                  "REJECTED",
                  "CANCELLED",
                  "EXPIRED",
                ].map((status) => (
                  <div key={status}>
                    <Status value={status} />
                    <strong>
                      {
                        reservations.filter((row) => row.status === status)
                          .length
                      }
                    </strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <section className="manager-section">
            <h2>Hóa đơn theo trạng thái</h2>
            <div className="portal-stat-list">
              {["OPEN", "PARTIALLY_PAID", "PAID"].map((status) => (
                <div key={status}>
                  <Status value={status} />
                  <span>
                    {invoices.filter((row) => row.status === status).length} hóa
                    đơn
                  </span>
                  <strong>
                    {money(
                      sum(
                        invoices.filter((row) => row.status === status),
                        "totalAmount",
                      ),
                    )}
                  </strong>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
