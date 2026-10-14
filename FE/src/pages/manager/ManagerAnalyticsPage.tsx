import { Download, RefreshCw } from "lucide-react";
import { useState } from "react";
import { usePortalSnapshot } from "../../services/usePortalSnapshot";
import {
  code,
  first,
  money,
  type Row,
} from "../../components/manager/portal-data";
import {
  LoadState,
  PageHeader,
  Status,
} from "../../components/manager/PortalUi";

function sum(items: Row[], field: string) {
  return items.reduce((value, row) => value + Number(row[field]), 0);
}
export function ManagerAnalyticsPage() {
  const { data, loading, error, refresh } = usePortalSnapshot();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const inPeriod = (row: Row, field: string) => {
    const value = first(row, field);
    const day = value
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Bangkok",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(value))
      : "";
    return (!from || day >= from) && (!to || day <= to);
  };
  const invoices =
    data?.invoices.items.filter((row) => inPeriod(row, "issuedAt")) ?? [];
  const payments =
    data?.payments.items.filter((row) => inPeriod(row, "receivedAt")) ?? [];
  const reservations =
    data?.reservations.items.filter((row) => inPeriod(row, "createdAt")) ?? [];
  const billed = sum(invoices, "totalAmount");
  const paid = sum(invoices, "amountPaid");
  const outstanding = sum(invoices, "balanceDue");
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
        "Khách hàng",
        "Ngày phát hành",
        "Trạng thái",
        "Tổng tiền VND",
        "Đã thu VND",
        "Còn thu VND",
      ],
      ...invoices.map((row) => [
        code(row),
        row.type,
        first(row, "reservation.customer.fullName"),
        row.issuedAt,
        row.status,
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
    link.download = `wdp-hoa-don-${from || "tat-ca"}-${to || "hien-tai"}.csv`;
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
          disabled={!data || loading}
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
      <div className="portal-toolbar">
        <label className="field-label">
          Từ ngày
          <input
            type="date"
            max={to || undefined}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="field-label">
          Đến ngày
          <input
            type="date"
            min={from || undefined}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          className="button-secondary"
          onClick={() => {
            setFrom("");
            setTo("");
          }}
        >
          Toàn bộ thời gian
        </button>
      </div>
      <LoadState loading={loading} error={error} retry={refresh} />
      {data && (
        <>
          <div className="portal-metrics">
            <article className="portal-metric">
              <span>Hóa đơn phát hành trong kỳ</span>
              <strong>{money(billed)}</strong>
              <small>{invoices.length} hóa đơn</small>
            </article>
            <article className="portal-metric">
              <span>Đã thu cho hóa đơn trong kỳ</span>
              <strong>{money(paid)}</strong>
              <small>
                {billed ? Math.round((paid / billed) * 100) : 0}% giá trị hóa
                đơn
              </small>
            </article>
            <article className="portal-metric">
              <span>Dư nợ hóa đơn trong kỳ</span>
              <strong>{money(outstanding)}</strong>
              <small>Số dư tại thời điểm tải dữ liệu</small>
            </article>
            <article className="portal-metric">
              <span>Khoản thu nhận trong kỳ</span>
              <strong>{money(sum(payments, "amount"))}</strong>
              <small>{payments.length} khoản thu</small>
            </article>
          </div>
          <p className="portal-report-note">
            Hóa đơn lọc theo ngày phát hành; khoản thu lọc theo ngày tiếp nhận.
            Số tiền bao gồm tiền thuê, cọc và phí được duyệt. Tiền hoàn cọc
            không được trừ trong các chỉ số này.
          </p>
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
                        data.units.items.map((row) =>
                          first(row, "storageType.name"),
                        ),
                      ),
                    ].map((name) => {
                      const group = data.units.items.filter(
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
