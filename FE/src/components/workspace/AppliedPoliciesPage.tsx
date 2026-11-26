import { Bell, CalendarDays, Check, Clock, Coins, CreditCard, Handshake, Info, Landmark, Layers, RefreshCw } from 'lucide-react';
import { useContext, useEffect } from 'react';
import { useAuth } from '../../auth/auth-context';
import { ManagerFacility } from '../manager/operations-workspace';
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
const snapshotNote = 'Hồ sơ đã lập xem theo điều khoản tại thời điểm xác nhận.';

function days(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value + ' ngày' : '—';
}

export function AppliedPoliciesPage() {
  const { user } = useAuth();
  const facility = useContext(ManagerFacility);
  const manager = user?.role === 'FACILITY_MANAGER';


  const resource = useApiResource<AppliedCatalog>(user ? '/business-policies/applied' : null, [user?.id, user?.role, facility?.id].join(':'), true);
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
    { icon: Clock, label: 'Giữ đơn chưa thanh toán', value: holdHours || (hold ? hold.value + ' ' + hold.unit : '—'), detail: holdHours && hold ? '(' + hold.value + ' ' + hold.unit + ')' : '' },
    { icon: CalendarDays, label: 'Báo trước khi trả kho', value: days(notice?.value) },
    { icon: Coins, label: 'Ân hạn thanh toán', value: days(overdue?.value.graceDays) },
    ...(manager ? [{ icon: RefreshCw, label: 'Mở yêu cầu gia hạn', value: days(renewal?.value.opensDaysBefore) }] : []),
  ];
  const versioned = [...policies.values()].filter(policy => policy.effectiveVersion > 0);

  return <section className="applied-policy">
    <header>
      <div className="applied-policy-heading">
        <h1>{manager ? 'Chính sách áp dụng' : 'Chính sách thuê kho'}</h1>
        {policies.size > 0 && <span className="applied-policy-badge"><Check size={15} />Đang áp dụng</span>}
      </div>
      <p>{manager ? 'Các điều khoản đang áp dụng tại cơ sở. Hồ sơ đã lập tuân theo chính sách tại thời điểm xác nhận.'
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
      {milestones.map(({ icon: Icon, label, value, detail }) => <div className="applied-policy-card applied-policy-milestone" key={label}>
        <span className="applied-policy-icon"><Icon size={21} /></span>
        <div><strong>{value}</strong><span>{label}</span>{detail && <span>{detail}</span>}</div>
      </div>)}
    </div>}
    {policies.size > 0 && <div className={'applied-policy-grid' + (manager ? ' applied-policy-grid-internal' : '')}>
      {policies.size > 0 && <div className="applied-policy-groups">
        {groups.map(({ title, icon: Icon, keys }) => {
          const items = keys.flatMap(key => policies.get(key) ?? []);
          return items.length > 0 && <section className="applied-policy-card" key={title} aria-labelledby={'policy-' + keys[0]}>
            <h2 id={'policy-' + keys[0]}><span className="applied-policy-icon"><Icon size={19} /></span>{title}</h2>
            <table aria-labelledby={'policy-' + keys[0]}>
              <thead><tr><th scope="col">Chính sách</th><th scope="col">Giá trị hiện hành</th><th scope="col">Hiệu lực</th></tr></thead>
              <tbody>{items.map(policy => <tr key={policy.key}>
                <th scope="row">{policy.title}<small>{policy.description}</small></th>
                <td>{'unit' in policy ? policy.value + ' ' + policy.unit
                  : pricingPolicySummary(policy.key, policy.value, manager && 'managerDays' in policy.value).split(policy.key === 'renewal' || policy.key === 'prepaid' ? ' · ' : '\n').map(line => <div key={line}>{line}</div>)}</td>
                <td>{policy.effectiveFrom ? <time dateTime={policy.effectiveFrom}>{dateTime.format(new Date(policy.effectiveFrom))} (UTC+7)</time>
                  : policy.effectiveVersion === 0 ? <span className="applied-policy-base">Giá trị cơ sở</span> : null}
                  {policy.effectiveVersion > 0 && <small>Phiên bản {policy.effectiveVersion}</small>}
                </td>
              </tr>)}</tbody>
            </table>
          </section>;
        })}
      </div>}
      {manager && <aside className="applied-policy-aside">
        {policies.size > 0 && <section className="applied-policy-card">
          <h2><span className="applied-policy-icon"><Info size={19} /></span>Thông tin hiệu lực</h2>
          <dl>
            {facility && <div><dt><Landmark size={16} />Cơ sở đang chọn</dt><dd>{facility.name}</dd></div>}
            <div><dt><Layers size={16} />Phạm vi hiệu lực</dt><dd>Danh mục chính sách chung</dd></div>
            <div><dt><Clock size={16} />Múi giờ</dt><dd>UTC+7</dd></div>
            <div><dt>Phiên bản chính sách</dt><dd>{versioned.length ? 'Xem theo từng điều khoản' : 'Giá trị cơ sở'}</dd></div>
          </dl>
          <p className="applied-policy-note"><Info size={16} />{snapshotNote}</p>
        </section>}
      </aside>}
    </div>}
  </section>;
}
