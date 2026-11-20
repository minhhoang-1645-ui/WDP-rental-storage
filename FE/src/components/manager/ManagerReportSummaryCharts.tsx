import { useState } from 'react';
import { isReportCount, reportBucketLabel, reportMoney, reportRange, type ReportGroup } from '../../utils/reporting';

const count = new Intl.NumberFormat('vi-VN');
const axisAmount = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });
const shortDate = (date: string, group: ReportGroup) => group === 'day' || group === 'week' ? date.slice(8, 10) + '/' + date.slice(5, 7) : reportBucketLabel(date, group);

type PaymentBucket = { date: string; received: number };
type StorageCounts = { total: number; available: number; occupied: number; reserved: number; maintenance: number };

function timeline(buckets: PaymentBucket[], group: ReportGroup, from: string, to: string) {
  const amounts = new Map(buckets.map(bucket => [bucket.date, bucket.received]));
  const start = group === 'week' ? reportRange('week', from).from : group === 'month' ? from.slice(0, 7) + '-01' : group === 'year' ? from.slice(0, 4) + '-01-01' : from;
  const cursor = new Date(start + 'T00:00:00Z');
  const points: PaymentBucket[] = [];
  for (let day = start; day <= to; day = cursor.toISOString().slice(0, 10)) {
    if (points.length === 120) return null;
    const date = group === 'year' ? day.slice(0, 4) : group === 'month' ? day.slice(0, 7) : day;
    points.push({ date, received: amounts.get(date) ?? 0 });
    if (group === 'year') cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
    else if (group === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + (group === 'week' ? 7 : 1));
  }
  return points;
}

export function ReceivedMoneyChart({ buckets, received, group, from, to }: {
  buckets: PaymentBucket[]; received: number; group: ReportGroup; from: string; to: string;
}) {
  const [active, setActive] = useState('');
  const valid = isReportCount(received) && Array.isArray(buckets) &&
    buckets.every(bucket => typeof bucket.date === 'string' && isReportCount(bucket.received)) &&
    new Set(buckets.map(bucket => bucket.date)).size === buckets.length &&
    buckets.reduce((sum, bucket) => sum + bucket.received, 0) === received;
  if (!valid) return <p className="manager-report-chart-empty" role="status">Số tiền theo từng mốc chưa khớp với tổng tiền đã nhận.</p>;
  if (!received) return <p className="manager-report-chart-empty">Chưa có khoản thu trong kỳ này.</p>;
  const points = timeline(buckets, group, from, to);
  if (!points) return <p className="manager-report-chart-empty">Chọn nhóm thời gian lớn hơn trong Chi tiết tài chính để xem trọn kỳ.</p>;
  if (points.reduce((sum, point) => sum + point.received, 0) !== received) {
    return <p className="manager-report-chart-empty" role="status">Số tiền theo từng mốc chưa khớp với kỳ đã chọn.</p>;
  }

  const highest = points.reduce((max, point) => Math.max(max, point.received), 0);
  const step = 10 ** Math.floor(Math.log10(highest));
  const ceiling = Math.ceil(highest / step) * step;
  const selected = points.find(point => point.date === active);
  const first = points[0], last = points[points.length - 1];
  const showEachLabel = points.length <= 7;

  return <div className="manager-report-trend">
    <div className="manager-report-plot">
      <div className="manager-report-axis" aria-hidden="true">
        {[ceiling, Math.round(ceiling / 2), 0].map((value, index) => <span key={index}>{axisAmount.format(value)} ₫</span>)}
      </div>
      <div className="manager-report-gridlines" aria-hidden="true"><span /><span /><span /></div>
      <ul className="manager-report-bars" data-single={points.length === 1} data-dense={points.length > 24} aria-label="Khoản thu theo từng mốc">
        {points.map(point => {
          const name = reportBucketLabel(point.date, group) + ' · ' + reportMoney(point.received);
          return <li key={point.date}>
            <button type="button" aria-label={name} title={name} aria-pressed={active === point.date} data-zero={point.received === 0}
              onFocus={() => setActive(point.date)} onClick={() => setActive(point.date)} onPointerEnter={() => setActive(point.date)}>
              <span style={{ height: (point.received / ceiling) * 100 + '%' }} />
            </button>
            {showEachLabel && <span className="manager-report-bar-label" aria-hidden="true">{shortDate(point.date, group)}</span>}
          </li>;
        })}
      </ul>
    </div>
    {!showEachLabel && <div className="manager-report-bucket-labels">
      <span>{reportBucketLabel(first.date, group)}</span>
      <span>{reportBucketLabel(last.date, group)}</span>
    </div>}
    <p className="manager-report-point" aria-live="polite">
      {selected ? <>{reportBucketLabel(selected.date, group)} <strong>{reportMoney(selected.received)}</strong></> : group === 'day' ? 'Theo ngày' : group === 'week' ? 'Theo tuần' : group === 'month' ? 'Theo tháng' : 'Theo năm'}
    </p>
  </div>;
}

export function StorageStatusChart({ units }: { units: StorageCounts }) {
  const statuses = [
    { key: 'available', name: 'Kho trống', value: units.available },
    { key: 'occupied', name: 'Kho đang dùng', value: units.occupied },
    { key: 'reserved', name: 'Kho đang giữ', value: units.reserved },
    { key: 'maintenance', name: 'Kho bảo trì', value: units.maintenance },
  ];
  const subtotal = statuses.reduce((sum, status) => sum + status.value, 0);
  if (!isReportCount(units.total) || !statuses.every(status => isReportCount(status.value)) || subtotal > units.total) {
    return <p className="manager-report-chart-empty" role="status">Số liệu trạng thái kho chưa khớp với tổng số kho.</p>;
  }
  if (!units.total) return <p className="manager-report-chart-empty">Chưa có kho vật lý.</p>;
  if (subtotal < units.total) statuses.push({ key: 'other', name: 'Kho chưa rõ trạng thái', value: units.total - subtotal });

  return <ul className="manager-report-storage" aria-label={`Tổng cộng ${count.format(units.total)} kho vật lý`}>
    {statuses.map(({ key, name, value }) => <li key={key} className={'is-' + key}>
      <span>{name}</span>
      <strong>{count.format(value)}</strong>
      <div className="manager-report-storage-track" aria-hidden="true">
        <span style={{ width: (value / units.total) * 100 + '%' }} />
      </div>
    </li>)}
  </ul>;
}
