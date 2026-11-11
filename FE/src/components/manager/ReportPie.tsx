import { useState } from "react";
import { reportPie, type PieDatum } from "../../utils/report-pie";

export function ReportPie({
  title,
  description,
  data,
  formatValue = String,
  unit = "lượt đặt",
}: {
  title: string;
  description: string;
  data: PieDatum[];
  formatValue?: (value: number) => string;
  unit?: string;
}) {
  const chart = reportPie(data),
    [selected, setSelected] = useState("");
  const active = chart.slices.find((item) => item.id === selected);
  const circumference = 2 * Math.PI * 45;
  return (
    <section className="manager-section report-pie">
      <h2>{title}</h2>
      <p>{description}</p>
      {!chart.valid ? (
        <p role="status">
          Chưa đủ số liệu để vẽ biểu đồ. Hãy kiểm tra các hóa đơn liên quan.
        </p>
      ) : !chart.total ? (
        <p className="report-pie-empty">
          Chưa có số liệu trong bộ lọc hiện tại.
        </p>
      ) : (
        <>
          <div className="report-pie-body">
            <div
              className="report-pie-graphic"
              role="img"
              aria-label={`Biểu đồ tròn ${title}: tổng ${formatValue(chart.total)} ${unit}`}
            >
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle
                  cx="60"
                  cy="60"
                  r="45"
                  fill="none"
                  stroke="#edf1f7"
                  strokeWidth="19"
                />
                {chart.slices.map((item) => (
                  <circle
                    key={item.id}
                    cx="60"
                    cy="60"
                    r="45"
                    fill="none"
                    stroke={item.color}
                    strokeWidth={active?.id === item.id ? 22 : 19}
                    opacity={active && active.id !== item.id ? 0.35 : 1}
                    strokeDasharray={`${item.fraction * circumference} ${circumference}`}
                    strokeDashoffset={-item.offset * circumference}
                    transform="rotate(-90 60 60)"
                    onMouseEnter={() => setSelected(item.id)}
                    onMouseLeave={() => setSelected("")}
                  >
                    <title>
                      {item.label}: {formatValue(item.value)} · {item.percent}
                    </title>
                  </circle>
                ))}
              </svg>
              <div className="report-pie-center">
                <small>{active?.label ?? "Tổng cộng"}</small>
                <strong>{formatValue(active?.value ?? chart.total)}</strong>
                <small>{active ? active.percent : unit}</small>
              </div>
            </div>
            <ul className="report-pie-legend">
              {chart.slices.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={selected === item.id}
                    onClick={() =>
                      setSelected(selected === item.id ? "" : item.id)
                    }
                    title={
                      item.members.length
                        ? "Gồm: " + item.members.join(", ")
                        : undefined
                    }
                  >
                    <span
                      className="report-pie-dot"
                      style={{ background: item.color }}
                    />
                    <span>
                      <b>{item.label}</b>
                      <small>
                        {formatValue(item.value)} {unit} ·{" "}
                        <strong>{item.percent}</strong>
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {chart.slices.some((item) => item.members.length) && (
            <p className="portal-report-note">
              “Các loại khác” gộp các phần nhỏ để biểu đồ dễ đọc. Bảng bên dưới
              vẫn giữ chi tiết từng loại kho.
            </p>
          )}
        </>
      )}
    </section>
  );
}
