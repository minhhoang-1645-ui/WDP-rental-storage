import { Bell, CalendarDays, Check, Clock, Coins, CreditCard, Handshake, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { pricingPolicySummary, type PricingPolicy } from '../../pages/operations/PricingPolicyFields';
import './applied-policies.css';

type PolicyInfo = { key: string; title: string; description: string; effectiveVersion: number; effectiveFrom: string | null };
type AppliedCatalog = { items: (PolicyInfo & { value: number; unit: string })[]; pricing: (PolicyInfo & PricingPolicy)[] };
const groups = [
  { title: 'Đặt kho và thanh toán', icon: CreditCard, keys: ['reservationHoldMinutes', 'deposit', 'prepaid', 'cancellation'] },
  { title: 'Hợp đồng và bàn giao', icon: Handshake, keys: ['handoverLeadDays', 'renewal', 'returnNoticeDays', 'earlyReturn'] },
  { title: 'Quá hạn và nhắc nhở', icon: Bell, keys: ['renewalReminderDays', 'paymentReminderDays', 'paymentOverdue', 'returnOverdue'] },
];
const dateTime = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

function days(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value + ' ngày' : '—';
}

export function AppliedPoliciesPage() {
  const { user } = useAuth();
  const manager = user?.role === 'FACILITY_MANAGER';


  const resource = useApiResource<AppliedCatalog>(user ? '/business-policies/applied' : null, [user?.id, user?.role].join(':'), true);
  const { refresh } = resource;
  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [user, refresh]);
  const policies = new Map([...(resource.data?.items ?? []), ...(resource.data?.pricing ?? [])].map(policy => [policy.key, policy] as const));
  const hold = resource.data?.items.find(policy => policy.key === 'reservationHoldMinutes');
  const holdHours = hold?.unit === 'phút' && hold.value % 60 === 0 ? hold.value / 60 + ' giờ' : '';
  const notice = resource.data?.items.find(policy => policy.key === 'returnNoticeDays');
  const overdue = resource.data?.pricing.find(policy => policy.key === 'paymentOverdue');
  const renewal = resource.data?.pricing.find(policy => policy.key === 'renewal');
  const milestones = [
    { icon: Clock, label: 'Giữ đơn chưa thanh toán', value: holdHours || (hold ? hold.value + ' ' + hold.unit : '—') },
    { icon: CalendarDays, label: 'Báo trước khi trả kho', value: days(notice?.value) },
    { icon: Coins, label: 'Ân hạn thanh toán', value: days(overdue?.value.graceDays) },
    ...(manager ? [{ icon: RefreshCw, label: 'Mở yêu cầu gia hạn', value: days(renewal?.value.opensDaysBefore) }] : []),
  ];

  return <section className="applied-policy">
    <header>
      <div className="applied-policy-heading">
        <h1>{manager ? 'Chính sách áp dụng' : 'Chính sách thuê kho'}</h1>
        {policies.size > 0 && <span className="applied-policy-badge"><Check size={15} />Đang áp dụng</span>}
      </div>
      <p>{manager ? 'Các điều khoản áp dụng cho toàn bộ cơ sở. Hồ sơ đã lập tuân theo chính sách tại thời điểm xác nhận.'
        : 'Xem đơn đặt kho, hợp đồng hoặc hóa đơn để biết điều khoản áp dụng cho hồ sơ của bạn.'}</p>
    </header>
    {resource.loading && <p role="status">Đang tải chính sách…</p>}
    {resource.error && <div className="applied-policy-card" role="alert">
      <p>{resource.status === 404 ? 'Máy chủ chưa cung cấp mục chính sách.'
        : 'Hiện chưa tải được chính sách. Vui lòng thử lại.'}</p>
      {resource.status !== 403 && <button type="button" className="button-secondary" disabled={resource.refreshing} onClick={resource.refresh}>Thử lại</button>}
    </div>}
    {resource.data && policies.size === 0 && <p role="status">Chưa có chính sách để hiển thị.</p>}
    {policies.size > 0 && <div className="applied-policy-milestones" aria-label="Những mốc quan trọng">
      {milestones.map(({ icon: Icon, label, value }) => <div className="applied-policy-card applied-policy-milestone" key={label}>
        <span className="applied-policy-icon"><Icon size={21} /></span>
        <div><strong>{value}</strong><span>{label}</span></div>
      </div>)}
    </div>}
    {policies.size > 0 && <div className="applied-policy-grid">
      {policies.size > 0 && <div className="applied-policy-groups">
        {groups.map(({ title, icon: Icon, keys }) => {
          const items = keys.flatMap(key => policies.get(key) ?? []);
          return items.length > 0 && <section className="applied-policy-card" key={title} aria-labelledby={'policy-' + keys[0]}>
            <h2 id={'policy-' + keys[0]}><span className="applied-policy-icon"><Icon size={19} /></span>{title}</h2>
            <table aria-labelledby={'policy-' + keys[0]}>
              <thead><tr><th scope="col">Chính sách</th><th scope="col">Giá trị hiện hành</th><th scope="col">Hiệu lực</th></tr></thead>
              <tbody>{items.map(policy => <tr key={policy.key}>
                <th scope="row">{policy.title}<small>{policy.description}</small></th>
                <td>{'unit' in policy ? (policy.key === 'reservationHoldMinutes' && holdHours ? holdHours : policy.value + ' ' + policy.unit)
                  : pricingPolicySummary(policy.key, policy.value, manager && 'managerDays' in policy.value).split(policy.key === 'renewal' || policy.key === 'prepaid' ? ' · ' : '\n').map(line => <div key={line}>{line}</div>)}</td>
                <td><div className={manager ? undefined : "applied-policy-effective"}>{policy.effectiveFrom ? <time dateTime={policy.effectiveFrom}>Áp dụng từ {dateTime.format(new Date(policy.effectiveFrom))} (UTC+7)</time>
                  : policy.effectiveVersion === 0 ? <span className="applied-policy-base">Đang dùng thiết lập ban đầu</span> : null}
                  {policy.effectiveVersion > 0 && <small>Phiên bản {policy.effectiveVersion} đang áp dụng</small>}
                </div></td>
              </tr>)}</tbody>
            </table>
          </section>;
        })}
      </div>}
    </div>}
  </section>;
}
