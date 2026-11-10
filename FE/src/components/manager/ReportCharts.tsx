import { ReportLine } from './ReportLine';
import { useState } from "react";
import { ReportPie } from "./ReportPie";
import { pieColors } from "../../utils/report-pie";
import { type Row } from "./portal-data";
import {
  buildReport,
  reportMoney as money,
  type ReportGroup,
} from "../../utils/reporting";

type Report = Pick<ReturnType<typeof buildReport>, 'times' | 'categories'>;
export function ReportCharts({
  report,
  group,
  units,
}: {
  report: Report;
  group: ReportGroup;
  units: Row[];
}) {
  const [sort, setSort] = useState("requests");
  const categories = [...report.categories].sort((a, b) =>
    sort === "rent"
      ? b.rent - a.rent
      : sort === "name"
        ? a.name.localeCompare(b.name, "vi")
        : b.requests - a.requests,
  );
  const maxRequests = Math.max(1, ...categories.map((row) => row.requests)),
    maxRent = Math.max(
      1,
      ...categories.map((row) => row.rent).filter(Number.isFinite),
    );
  const unitCount = (status?: string) => units.filter(row => !status || row.status === status).reduce((sum, row) => sum + (typeof row.count === 'number' ? row.count : 1), 0);
  const occupied = unitCount('OCCUPIED');
  return (
    <>
      <div className="portal-overview-grid report-charts">
        <section className="manager-section">
          <h2>Tiền thuê và tiền đã nhận theo thời gian</h2>
          <p>
            Tiền thuê lấy theo ngày lập hóa đơn; tiền đã nhận lấy theo ngày nhận
            tiền và có thể gồm cọc, dịch vụ. Hai cột không phải cùng một khoản.
          </p>
          <div className="report-chart-legend">
            <span>■ Tiền thuê trên hóa đơn</span>
            <span>■ Tiền đã nhận (gồm cọc/phí)</span>
          </div>
          <ReportLine points={report.times} group={group} />
        </section>
        <ReportPie
          title="Tình trạng kho hiện tại"
          description={`${occupied} / ${unitCount()} kho đang sử dụng. Đây là tình trạng khi tải báo cáo, không phải tình trạng trong quá khứ.`}
          unit="kho"
          data={[
            { id: "OCCUPIED", label: "Đang dùng", color: "#355a8d" },
            { id: "AVAILABLE", label: "Sẵn sàng", color: "#398779" },
            { id: "RESERVED", label: "Đang giữ", color: "#c78138" },
            { id: "MAINTENANCE", label: "Bảo trì", color: "#b95f68" },
          ].map((item) => ({
            ...item,
            value: unitCount(item.id),
          }))}
        />
      </div>
      <div className="portal-overview-grid report-charts">
        <ReportPie
          title="Lượt đặt theo loại kho"
          description="Tỷ lệ lượt gửi đặt trong thời gian đã chọn. Một đơn nhiều kho vẫn tính một lượt; xem số đã xác nhận trong bảng chi tiết."
          data={report.categories.map((row, index) => ({
            id: row.id,
            label: row.name,
            value: row.requests,
            color: pieColors[index % pieColors.length],
          }))}
        />
        <ReportPie
          title="Tiền thuê theo loại kho"
          description="Tỷ trọng tiền thuê trên hóa đơn phát hành trong thời gian đã chọn; đã trừ ưu đãi, không gồm cọc, dịch vụ hoặc phí."
          unit=""
          formatValue={money}
          data={report.categories.map((row, index) => ({
            id: row.id,
            label: row.name,
            value: row.rent,
            color: pieColors[index % pieColors.length],
          }))}
        />
      </div>
      <section className="manager-section">
        <div className="portal-section-title">
          <h2>Loại kho nào được đặt nhiều? Tiền thuê bao nhiêu?</h2>
          <label>
            Sắp xếp
            <select
              aria-label="Sắp xếp loại kho"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="requests">Lượt đặt nhiều nhất</option>
              <option value="rent">Tiền thuê cao nhất</option>
              <option value="name">Tên loại kho</option>
            </select>
          </label>
        </div>
        <p>
          Một đơn là một lượt đặt, dù đặt nhiều kho. Tiền thuê là số đã tính
          trên hóa đơn còn hiệu lực, đã trừ ưu đãi; không gồm cọc, dịch vụ và
          không đồng nghĩa đã nhận đủ tiền.
        </p>
        <div className="manager-table-wrap">
          <table className="manager-table report-type-table">
            <thead>
              <tr>
                <th>Loại kho</th>
                <th>Lượt gửi đặt kho</th>
                <th>Đã xác nhận</th>
                <th>Tiền thuê trên hóa đơn</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td data-label="Lượt gửi đặt kho">
                    <strong>{row.requests}</strong>
                    <div className="report-bar-track">
                      <div
                        className="report-bar"
                        style={{
                          width: `${(row.requests / maxRequests) * 100}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td data-label="Đã xác nhận">{row.confirmed}</td>
                  <td data-label="Tiền thuê trên hóa đơn">
                    <strong>{money(row.rent)}</strong>
                    <div className="report-bar-track">
                      <div
                        className="report-bar is-cash"
                        style={{
                          width: `${Number.isFinite(row.rent / maxRent) ? (row.rent / maxRent) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!categories.length && <p>Chưa có lượt đặt hoặc hóa đơn phù hợp.</p>}
        </div>
      </section>
    </>
  );
}
