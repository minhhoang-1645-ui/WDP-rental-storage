import { FileText, Wallet, CircleDollarSign, Boxes } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { isReportDay, reportBucketLabel } from '../../utils/reporting';
import { displayCount, displayMoney, displayPercent, fraction, money, occupancy, sumMoney, type Performance, type Trend, type TrendGroup } from './operations-report-data';

export function ReportMetrics({ items, loading }: { items: Performance[]; loading: boolean }) {
  const total = items.reduce((sum, item) => sum + item.units?.total, 0);
  const occupied = items.reduce((sum, item) => sum + item.units?.occupied, 0);
  const rate = occupancy(occupied, total);
  const metrics = [
    { title: 'Tiền thuê đã lập hóa đơn', value: displayMoney(sumMoney(items, 'rent')), scope: 'Trong kỳ báo cáo', detail: '', icon: FileText },
    { title: 'Tiền đã thu', value: displayMoney(sumMoney(items, 'received')), scope: 'Trong kỳ báo cáo', detail: 'Bao gồm tiền cọc', icon: Wallet },
    { title: 'Công nợ hiện tại', value: displayMoney(sumMoney(items, 'debt')), scope: 'Tại thời điểm hiện tại', detail: '', icon: CircleDollarSign },
    { title: 'Tỷ lệ sử dụng kho', value: rate === null ? '—' : displayPercent(rate), scope: 'Tại thời điểm hiện tại',
      detail: loading ? '—/— kho đang sử dụng' : `${displayCount(occupied)}/${displayCount(total)} kho đang sử dụng`, icon: Boxes },
  ];
  return <div className="bom-report-kpis" aria-busy={loading}>
    {metrics.map(({ title, value, scope, detail, icon: Icon }) => <article className="bom-report-panel bom-report-kpi" key={title}>
      <div><span>{title}</span><Icon size={17} aria-hidden="true" /></div>
      <strong>{loading ? '—' : value}</strong>
      <small>{scope}{detail && <><span aria-hidden="true"> · </span>{detail}</>}</small>
    </article>)}
  </div>;
}

const invoiceParts = [
  ['rent', 'Tiền thuê', 'var(--bom-report-brand)'],
  ['services', 'Dịch vụ bổ trợ', 'var(--bom-report-blue)'],
  ['fees', 'Phí khác', 'var(--bom-report-amber)'],
  ['deposit', 'Tiền cọc trên hóa đơn', 'var(--bom-report-violet)'],
] as const;
const refundKeys = ['depositRefunded', 'rentRefunded', 'bookingRefunded', 'transferRefunded'] as const;
const compactMoney = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });

export function ReportFinances({ items, invoiceCount, loading }: { items: Performance[]; invoiceCount?: number; loading: boolean }) {
  const total = sumMoney(items, 'billed');
  const totalRefunded = items.reduce<bigint | null>((subtotal, item) =>
    refundKeys.reduce<bigint | null>((sum, key) => {
      const amount = money(item[key]);
      return sum === null || amount === null || amount < 0n ? null : sum + amount;
    }, subtotal), items.length ? 0n : null);
  const parts = invoiceParts.map(([key, label, color]) => ({ key, label, color, value: sumMoney(items, key) }));
  const complete = parts.every(part => part.value !== null && part.value >= 0n)
    && parts.reduce((sum, part) => sum + (part.value ?? 0n), 0n) === total;
  const reconciled = complete && total !== null && total > 0n;
  let accumulated = 0n;
  const arcs = reconciled ? parts.flatMap(({ color, value }) => {
    if (!value) return [];
    const start = fraction(accumulated, total);
    accumulated += value;
    return [`${color} ${start}% ${fraction(accumulated, total)}%`];
  }) : [];
  const compositionNote = loading ? 'Đang tải số liệu hóa đơn…'
    : total === 0n && invoiceCount === 0 ? 'Không phát sinh hóa đơn trong kỳ'
    : total === 0n && complete ? 'Tổng giá trị hóa đơn trong kỳ bằng 0 ₫'
    : total === null || parts.some(part => part.value === null) ? 'Chưa đủ số liệu hóa đơn.'
    : !reconciled ? 'Số liệu hóa đơn chưa khớp.' : '';
  const amountLabel = (value: bigint | null) => loading ? '—' : displayMoney(value);

  return <section className="bom-report-panel" aria-labelledby="bom-report-invoice-title">
      <h2 id="bom-report-invoice-title">Cơ cấu hóa đơn trong kỳ</h2>
      <div className="bom-report-composition">
        <div className="bom-report-donut-area">
          <div className="bom-report-donut" aria-hidden="true"
            style={reconciled ? { background: 'conic-gradient(' + arcs.join(', ') + ')' } : undefined}>
            <div><span>Tổng hóa đơn</span><strong>{total === null ? '—' : compactMoney.format(total) + ' ₫'}</strong></div>
          </div>
          <p className="bom-report-donut-note">{compositionNote}</p>
        </div>
        <dl className="bom-report-ledger bom-report-invoice-ledger">
          {parts.map(({ key, label, color, value }) => <div key={key}>
            <dt><i style={reconciled && value !== 0n ? { background: color } : undefined} />{label}</dt>
            <dd>{amountLabel(value)}<small>{reconciled && value !== null ? displayPercent(fraction(value, total)) : null}</small></dd>
          </div>)}
          <div className="bom-report-total"><dt>Tổng giá trị hóa đơn</dt><dd>{amountLabel(total)}</dd></div>
        </dl>
      </div>
      {!loading && totalRefunded !== null && <dl className="bom-report-refund-summary">
        <dt>Tổng tiền đã hoàn (bao gồm cọc)</dt>
        <dd>{displayMoney(totalRefunded)}</dd>
      </dl>}
    </section>;
}

function chartStep(max: bigint) {
  const quarter = (max + 3n) / 4n;
  const base = 10n ** BigInt(String(quarter).length - 1);
  return ([1n, 2n, 5n, 10n].find(multiple => multiple * base >= quarter) ?? 10n) * base;
}

const axisFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const axisValue = (value: bigint, divisor: bigint) => axisFormatter.format(Number(value * 100n / divisor) / 100);
function trendValues(trend: Trend | null, group: TrendGroup) {
  if (!trend || trend.times.some(row => group === 'day' ? !isReportDay(row.date) : !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.date))) return null;
  return trend.times.map(row => ({ ...row, rent: money(row.rent), received: money(row.received) }));
}

export function ReportDateContext({ trend, facility, range, openRange, group }: {
  trend: Trend | null; facility: string; range: string; openRange: boolean; group: TrendGroup;
}) {
  const semantics = trend?.dateSemantics;
  const first = trend?.times[0], last = trend?.times.at(-1);
  return <div className="bom-report-date-context">
    <p><strong>{facility}</strong> · {range} · UTC+7</p>
    {openRange && first && last && <p>Mốc mở lấy từ dữ liệu thực tế. Chuỗi hiển thị từ {reportBucketLabel(first.date, group)} đến {reportBucketLabel(last.date, group)}.</p>}
    {semantics && <ul>
      <li><strong>Tiền thuê đã lập hóa đơn</strong> · {semantics.rent}</li>
      <li><strong>Tiền đã thu</strong> · {semantics.received}</li>
      <li><strong>Đơn mới</strong> · {semantics.bookings}</li>
    </ul>}
  </div>;
}

export function ReportTrend({ trend, group, loading }: { trend: Trend | null; group: TrendGroup; loading: boolean }) {
  const values = trendValues(trend, group);
  const rows = values ?? [];
  const max = rows.reduce((top, { rent, received }) =>
    [rent, received].reduce<bigint>((value, amount) => amount !== null && amount > value ? amount : value, top), 0n);
  const invalid = !values || rows.some(row => row.rent === null || row.rent < 0n || row.received === null || row.received < 0n);
  const emptyMessage = loading ? 'Đang tải xu hướng tài chính…'
    : invalid ? 'Chưa đủ số liệu hợp lệ để vẽ biểu đồ.'
    : !rows.length ? 'Không phát sinh tiền thuê lập hóa đơn hoặc tiền đã thu trong kỳ.' : '';
  const step = max > 0n ? chartStep(max) : 0n, limit = step * 4n;
  const [unit, divisor] = limit >= 1_000_000_000n ? ['tỷ đồng', 1_000_000_000n] : limit >= 1_000_000n ? ['triệu đồng', 1_000_000n]
    : limit >= 1_000n ? ['nghìn đồng', 1_000n] : ['đồng', 1n];
  return <figure className="bom-report-trend" aria-label={'Xu hướng tài chính theo ' + (group === 'day' ? 'ngày' : 'tháng')}>
    <figcaption><span><i className="is-rent" />Tiền thuê đã lập hóa đơn</span><span><i className="is-received" />Tiền đã thu</span></figcaption>
    {!emptyMessage && max === 0n && <p className="bom-report-chart-note">Không phát sinh tiền thuê lập hóa đơn hoặc tiền đã thu trong kỳ.</p>}
    <span className="bom-report-axis-unit">{!emptyMessage && unit}</span>
    <div className="bom-report-chart">
      <div className="bom-report-axis" aria-hidden="true">{!emptyMessage && (max === 0n ? [0n] : [4n, 3n, 2n, 1n, 0n]).map(point =>
        <span key={String(point)} style={{ top: Number(4n - point) * 25 + '%' }}>{axisValue(point * step, divisor)}</span>)}</div>
      <div className="bom-report-chart-scroll">
        <div className="bom-report-plot" style={emptyMessage ? undefined : { gridTemplateColumns: `repeat(${rows.length}, minmax(92px, 1fr))` }}>
          <div className="bom-report-gridlines" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          {emptyMessage ? <p className="bom-report-chart-empty"><span>{emptyMessage}</span></p> : rows.map(({ date, rent, received }) => {
            const label = reportBucketLabel(date, group);
            return <div key={date} className="bom-report-bucket" tabIndex={0}
              aria-label={`${label}. Tiền thuê ${displayMoney(rent)}. Tiền đã thu ${displayMoney(received)}.`}>
              <div className="bom-report-bars" aria-hidden="true">
                <span className="is-rent" style={{ height: fraction(rent ?? 0n, limit) + '%' }} />
                <span className="is-received" style={{ height: fraction(received ?? 0n, limit) + '%' }} />
              </div>
              <span className="bom-report-bucket-label">{label}</span>
              <div className="bom-report-tooltip" role="tooltip" aria-hidden="true">
                <strong>{label}</strong><span>Tiền thuê <b>{displayMoney(rent)}</b></span><span>Tiền đã thu <b>{displayMoney(received)}</b></span>
              </div>
            </div>;
          })}
        </div>
      </div>
    </div>
  </figure>;
}

const comparisons = [
  ['Cơ sở', '', '15%'], ['Tỷ lệ sử dụng', 'Hiện tại', '10%'], ['Tình trạng kho', 'Hiện tại', '12%'], ['HĐ hoạt động', 'Hiện tại', '10%'],
  ['Đơn mới', 'Trong kỳ', '7%'], ['Bàn giao / trả kho', 'Trong kỳ', '10%'], ['Tiền thuê lập hóa đơn', 'Trong kỳ', '12%'],
  ['Tiền đã thu', 'Trong kỳ', '12%'], ['Công nợ', 'Hiện tại', '12%'],
] as const;

function facilityStatus(item: Performance) {
  if (item.operationalStatus === 'CLOSED') return 'Đã ngừng hoạt động';
  if (item.operationalStatus === 'CLOSING') return 'Đang ngừng hoạt động';
  return item.bookingEnabled ? 'Đang nhận đặt kho' : 'Tạm dừng nhận đặt kho';
}

export function ReportComparison({ items }: { items: Performance[] }) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const status = facilityStatus(item);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return <section className="bom-report-panel">
    <header className="bom-report-section-header">
      <h2>So sánh hiệu quả cơ sở</h2>
    </header>
    {!!items.length && <p className="bom-report-chart-note"><strong>{displayCount(items.length)} cơ sở</strong>
      {['Đang nhận đặt kho', 'Tạm dừng nhận đặt kho', 'Đang ngừng hoạt động', 'Đã ngừng hoạt động'].map(status =>
        <span key={status}> · {status} {displayCount(counts.get(status) ?? 0)}</span>)}</p>}
    <div className="manager-table-wrap bom-report-table bom-report-comparison" tabIndex={0} role="region" aria-label="Bảng so sánh hiệu quả cơ sở">
      <table className="manager-table">
        <colgroup>{comparisons.map(([label, , width]) => <col key={label} style={{ width }} />)}</colgroup>
        <thead><tr>{comparisons.map(([label, scope], index) => <th scope="col" key={label} className={index >= 6 ? 'bom-report-money' : undefined}>
          {label}{scope && <small>{scope}</small>}
        </th>)}</tr></thead>
        <tbody>{items.length === 0 && <tr><td colSpan={comparisons.length}>Đang tải số liệu cơ sở…</td></tr>}{items.map(item => {
          const rate = occupancy(item.units?.occupied, item.units?.total);
          const status = facilityStatus(item);
          return <tr key={item.id}>
            <td><Link to={'/operations/facilities/' + encodeURIComponent(item.id)}>{item.name}</Link><small>{status}</small></td>
            <td><strong>{item.units?.total === 0 ? 'Chưa có kho' : rate === null ? '—' : displayPercent(rate)}</strong>{item.units?.total !== 0 && <small>{displayCount(item.units?.occupied)}/{displayCount(item.units?.total)} kho</small>}
              {rate !== null && <progress aria-label={'Tỷ lệ sử dụng ' + item.name} value={rate} max={100} />}
            </td>
            <td><dl className="bom-report-stock">
              <div><dt>Trống</dt><dd>{displayCount(item.units?.available)}</dd></div>
              <div><dt>Đang giữ</dt><dd>{displayCount(item.units?.reserved)}</dd></div>
              <div><dt>Bảo trì</dt><dd>{displayCount(item.units?.maintenance)}</dd></div>
            </dl></td>
            <td>{displayCount(item.activeContracts)}</td><td>{displayCount(item.newReservations)}</td>
            <td><dl className="bom-report-stock"><div><dt>Bàn giao</dt><dd>{displayCount(item.handovers)}</dd></div><div><dt>Trả kho</dt><dd>{displayCount(item.returns)}</dd></div></dl></td>
            {(['rent', 'received', 'debt'] as const).map(key => <td key={key} className="bom-report-money">{displayMoney(money(item[key]))}</td>)}
          </tr>;
        })}</tbody>
      </table>
    </div>
  </section>;
}

export function ReportTrendTable({ trend, group, loading, context }: { trend: Trend | null; group: TrendGroup; loading: boolean; context: ReactNode }) {
  const rows = trendValues(trend, group);
  const label = group === 'day' ? 'ngày' : 'tháng';
  return <details className="bom-report-panel bom-report-trend-details">
    <summary>Xem số liệu chi tiết theo {label}</summary>
    {context}
    <div className="manager-table-wrap bom-report-table">
      <table className="manager-table">
        <thead><tr><th scope="col">{group === 'day' ? 'Ngày' : 'Tháng'}</th><th scope="col" className="bom-report-money">Tiền thuê đã lập hóa đơn</th>
          <th scope="col" className="bom-report-money">Tiền đã thu</th><th scope="col">Đơn mới</th></tr></thead>
        <tbody>{!rows?.length && <tr><td colSpan={4}>{loading ? 'Đang tải số liệu…' : rows ? 'Không có số liệu chi tiết trong kỳ.' : 'Chưa có số liệu chi tiết.'}</td></tr>}
        {rows?.map(row => <tr key={row.date}><th scope="row">{reportBucketLabel(row.date, group)}</th>
          <td className="bom-report-money">{displayMoney(row.rent)}</td><td className="bom-report-money">{displayMoney(row.received)}</td><td>{displayCount(row.bookings)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </details>;
}
