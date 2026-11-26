import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import './applied-policies.css';

type OperationalValue = number | { opensDaysBefore: number; closesDaysBefore: number; priceMode: string } | { graceDays: number; managerDays: number };
type Entry = { key: string; title: string; value: OperationalValue; effectiveFrom: string | null; effectiveVersion: number };
type StaffCatalog = {
  entries: Entry[];
  updates: { key: string; title: string; version: number; effectiveFrom: string; scheduled: boolean; oldValue: OperationalValue | null; value: OperationalValue }[];
  facilities: string[];
};
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
const groups = [
  { title: 'Nhận kho và bàn giao', keys: ['handoverLeadDays'], guidance: 'Đối chiếu lịch bàn giao và ngày bắt đầu thuê trong hồ sơ. Kích hoạt hợp đồng từ ngày bắt đầu thuê.', to: '/staff/tasks?type=appointments' },
  { title: 'Gia hạn hợp đồng', keys: ['renewal', 'renewalReminderDays'], guidance: 'Đối chiếu ngày hết hạn khi tiếp nhận yêu cầu. Chuyển Quản lý cơ sở xử lý trường hợp ngoài thời hạn hoặc cần ngoại lệ.' },
  { title: 'Trả kho', keys: ['returnNoticeDays'], guidance: 'Ghi nhận đề nghị và bố trí lịch theo hồ sơ. Chuyển Quản lý cơ sở xử lý quyết toán trả kho trước hạn, phí và hoàn tiền.', to: '/staff/tasks?type=returns' },
  { title: 'Quá hạn và xử lý', keys: ['paymentReminderDays', 'paymentOverdue', 'returnOverdue'], guidance: 'Đối chiếu hạn trong hồ sơ, ghi nhận tình trạng và báo Quản lý cơ sở khi đến mốc chuyển xử lý.' },
];

function operationalValue(value: OperationalValue) {
  if (typeof value === 'number') return value + ' ngày';
  if ('graceDays' in value) return `Ân hạn ${value.graceDays} ngày · Báo quản lý sau ${value.managerDays} ngày`;
  return `Mở trước ${value.opensDaysBefore} ngày · Đóng trước ${value.closesDaysBefore} ngày · ${value.priceMode === 'CONTRACT_RATE' ? 'Giá hợp đồng' : 'Giá niêm yết hiện hành'}`;
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

  return <section className="applied-policy">
    <header>
      <div className="applied-policy-heading"><h1>Chính sách áp dụng</h1><span className="applied-policy-badge">Chỉ tra cứu – Không có quyền chỉnh sửa</span></div>
      <p>Tra cứu các điều khoản thuê kho phục vụ công việc được phân công.</p>
      {catalog && <p>Cơ sở được phân công · {catalog.facilities.join(', ')}</p>}
    </header>
    {resource.loading && <p role="status">Đang tải chính sách…</p>}
    {resource.error && <div className="applied-policy-card" role="alert">
      <p>{resource.status === 403 ? 'Bạn cần quyền truy cập cơ sở đang hiệu lực để xem chính sách vận hành.' : 'Hiện chưa tải được chính sách.'}</p>
      <button type="button" className="button-secondary" disabled={resource.refreshing} onClick={refresh}>Thử lại</button>
    </div>}
    {catalog && <>
      <p className="applied-policy-note">Khi xử lý hồ sơ, hãy đối chiếu điều khoản đã cam kết tại thời điểm xác nhận.</p>
      {!catalog.entries.length && <p role="status">Chưa có chính sách để hiển thị.</p>}
      {catalog.updates.length > 0 && <section className="applied-policy-card">
        <h2>Cập nhật chính sách</h2>
        <ul className="staff-policy-list">{catalog.updates.map(update => <li key={update.key + ':' + update.version}>
          <strong>{update.title} · Phiên bản {update.version}</strong>
          <p>{update.scheduled ? 'Sắp có hiệu lực' : 'Đã có hiệu lực'} · {dateTime.format(new Date(update.effectiveFrom))} (UTC+7)</p>
          {update.oldValue !== null && <p>Trước đây · {operationalValue(update.oldValue)}</p>}
          <p>Giá trị mới · {operationalValue(update.value)}</p>
          <p>{groups.find(group => group.keys.includes(update.key))?.guidance}</p>
        </li>)}</ul>
        <Link to="/staff/notifications?kind=policy-effective">Xem thông báo và đánh dấu đã đọc</Link>
      </section>}
      {groups.map(group => {
        const entries = catalog.entries.filter(entry => group.keys.includes(entry.key));
        return entries.length > 0 && <details className="applied-policy-card staff-policy-group" key={group.title} id={group.keys[0]} open>
          <summary><strong>{group.title}</strong></summary>
          <ul className="staff-policy-list">{entries.map(entry => <li key={entry.key}>
            <strong>{entry.title}</strong><p>{operationalValue(entry.value)}</p>
            <p>{entry.effectiveFrom ? `Phiên bản ${entry.effectiveVersion} · Hiệu lực ${dateTime.format(new Date(entry.effectiveFrom))} (UTC+7)` : 'Giá trị cơ sở'}</p>
          </li>)}</ul>
          <p>{group.guidance}</p>
          {group.to && <Link to={group.to}>Xem công việc liên quan</Link>}
        </details>;
      })}
    </>}
  </section>;
}
