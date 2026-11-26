import { Bell, CalendarDays, Clock, Handshake, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import './applied-policies.css';

type OperationalValue = number | { opensDaysBefore: number; closesDaysBefore: number; priceMode: string } | { graceDays: number; managerDays: number };
type Entry = { key: string; title: string; value: OperationalValue; effectiveFrom: string | null; effectiveVersion: number };
type StaffCatalog = {
  entries: Entry[];
};
const dateTime = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
const groups = [
  { title: 'Nhận kho và bàn giao', icon: Handshake, keys: ['handoverLeadDays'] },
  { title: 'Gia hạn hợp đồng', icon: RefreshCw, keys: ['renewal', 'renewalReminderDays'] },
  { title: 'Trả kho', icon: CalendarDays, keys: ['returnNoticeDays'] },
  { title: 'Quá hạn và xử lý', icon: Bell, keys: ['paymentReminderDays', 'paymentOverdue', 'returnOverdue'] },
];

function operationalValue(value: OperationalValue) {
  if (typeof value === 'number') return value + ' ngày';
  if ('graceDays' in value) return `${value.graceDays ? `Ân hạn ${value.graceDays} ngày` : 'Không có thời gian ân hạn'} · Báo quản lý sau ${value.managerDays} ngày quá hạn`;
  return `Mở trước ngày hết hạn ${value.opensDaysBefore} ngày · Đóng trước ngày hết hạn ${value.closesDaysBefore} ngày · ${value.priceMode === 'CONTRACT_RATE' ? 'Giá hợp đồng' : 'Giá niêm yết hiện hành'}`;
}

export function StaffAppliedPoliciesPage() {
  const { user } = useAuth();
  const resource = useApiResource<StaffCatalog>(user ? '/business-policies/applied' : null, user?.id, true);
  const { refresh } = resource;
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const catalog = resource.data;


  const entriesByKey = new Map(catalog?.entries.map(entry => [entry.key, entry]));
  const renewal = entriesByKey.get('renewal')?.value;
  const overdue = entriesByKey.get('paymentOverdue')?.value;
  const milestones = [
    { icon: Handshake, label: 'Nhận chìa khóa trước ngày thuê', days: entriesByKey.get('handoverLeadDays')?.value },
    { icon: CalendarDays, label: 'Báo trước khi trả kho', days: entriesByKey.get('returnNoticeDays')?.value },
    { icon: Clock, label: 'Ân hạn thanh toán', days: typeof overdue === 'object' && 'graceDays' in overdue ? overdue.graceDays : undefined },
    { icon: RefreshCw, label: 'Mở yêu cầu gia hạn', days: typeof renewal === 'object' && 'opensDaysBefore' in renewal ? renewal.opensDaysBefore : undefined },
  ];

  return <section className="applied-policy">
    <header><h1>Chính sách áp dụng</h1></header>
    {resource.loading && <p role="status">Đang tải chính sách…</p>}
    {resource.error && <div className="applied-policy-card" role="alert">
      <p>{resource.status === 403 ? 'Tài khoản hiện không có quyền tra cứu chính sách.' : 'Hiện chưa tải được chính sách.'}</p>
      <button type="button" className="button-secondary" disabled={resource.refreshing} onClick={refresh}>Thử lại</button>
    </div>}
    {catalog && <>
      {!catalog.entries.length && <p role="status">Chưa có chính sách để hiển thị.</p>}
      {catalog.entries.length > 0 && <div className="applied-policy-milestones" aria-label="Những mốc quan trọng">
        {milestones.map(({ icon: Icon, label, days }) => typeof days === 'number' && <div className="applied-policy-card applied-policy-milestone" key={label}>
          <span className="applied-policy-icon"><Icon size={21} /></span>
          <div><strong>{days} ngày</strong><span>{label}</span></div>
        </div>)}
      </div>}
      <div className="applied-policy-grid">
        <div className="applied-policy-groups">
          {groups.map(({ icon: Icon, ...group }) => {
            const entries = group.keys.flatMap(key => entriesByKey.get(key) ?? []);
            const headingId = 'staff-policy-' + group.keys[0];
            return entries.length > 0 && <section className="applied-policy-card" key={group.title} id={group.keys[0]} aria-labelledby={headingId}>
              <h2 id={headingId}><span className="applied-policy-icon"><Icon size={19} /></span>{group.title}</h2>
              <table aria-labelledby={headingId}>
                <thead><tr><th scope="col">Chính sách</th><th scope="col">Giá trị hiện hành</th><th scope="col">Hiệu lực</th></tr></thead>
                <tbody>{entries.map(entry => <tr key={entry.key}>
                  <th scope="row">{entry.title}</th>
                  <td>{operationalValue(entry.value).split(' · ').map(line => <div key={line}>{line}</div>)}</td>
                  <td>{entry.effectiveFrom
                    ? <><time dateTime={entry.effectiveFrom}>Áp dụng từ {dateTime.format(new Date(entry.effectiveFrom))} (UTC+7)</time><small>Phiên bản {entry.effectiveVersion} đang áp dụng</small></>
                    : <span className="applied-policy-base">Đang dùng thiết lập ban đầu</span>}</td>
                </tr>)}</tbody>
              </table>
            </section>;
          })}
        </div>
      </div>
    </>}
  </section>;
}
