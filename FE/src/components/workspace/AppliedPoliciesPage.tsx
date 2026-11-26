import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { pricingPolicySummary, type PricingPolicy } from '../../pages/operations/PricingPolicyFields';
import '../../pages/operations/operations-policies.css';

type PolicyInfo = { key: string; title: string; description: string; effectiveVersion: number; effectiveFrom: string | null };
type AppliedCatalog = { items: (PolicyInfo & { value: number; unit: string })[]; pricing: (PolicyInfo & PricingPolicy)[] };
const groups = [
  { title: 'Đặt kho và thanh toán', keys: ['reservationHoldMinutes', 'deposit', 'prepaid', 'cancellation'] },
  { title: 'Hợp đồng và bàn giao', keys: ['handoverLeadDays', 'renewal', 'returnNoticeDays', 'earlyReturn'] },
  { title: 'Quá hạn và nhắc nhở', keys: ['renewalReminderDays', 'paymentReminderDays', 'paymentOverdue', 'returnOverdue'] },
];
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

export function AppliedPoliciesPage() {
  const { user } = useAuth();
  const manager = user?.role === 'FACILITY_MANAGER';
  const resource = useApiResource<AppliedCatalog>('/business-policies/applied', user?.id ?? '');
  const policies = [...(resource.data?.items ?? []), ...(resource.data?.pricing ?? [])];
  return <section className="policy-page">
    <header className="policy-page-heading">
      <h1>{manager ? 'Chính sách áp dụng' : 'Chính sách thuê kho'}</h1>
      <p>Quy định hiện hành áp dụng toàn hệ thống. Với hồ sơ đã lập, hãy xem thời hạn và điều khoản áp dụng trong đơn, hợp đồng hoặc hóa đơn tương ứng.</p>
    </header>
    {resource.loading && <p role="status">Đang tải chính sách…</p>}
    {resource.error && <div role="alert"><p>{resource.status === 404 ? 'Máy chủ chưa cung cấp mục chính sách. Vui lòng thử lại sau.' : 'Hiện chưa tải được chính sách. Vui lòng thử lại.'}</p><button type="button" className="button-secondary" onClick={resource.refresh}>Thử lại</button></div>}
    {groups.map(group => {
      const items = group.keys.flatMap(key => policies.find(policy => policy.key === key) ?? []);
      return items.length > 0 && <section className="policy-catalog" key={group.title}>
        <div className="policy-table-scroll"><table className="policy-table">
          <caption>{group.title}</caption>
          <thead><tr><th>Chính sách</th><th>Giá trị hiện hành</th><th>Hiệu lực (UTC+7)</th></tr></thead>
          <tbody>{items.map(policy => <tr key={policy.key}>
            <th scope="row"><span>{policy.title}</span><small>{policy.description}</small></th>
            <td className="policy-active-value">{'unit' in policy ? policy.value + ' ' + policy.unit : pricingPolicySummary(policy.key, policy.value, manager)}</td>
            <td>{policy.effectiveFrom ? dateTime.format(new Date(policy.effectiveFrom)) : 'Giá trị cơ sở'}
              {policy.effectiveVersion > 0 && <small>Phiên bản {policy.effectiveVersion}</small>}
            </td>
          </tr>)}</tbody>
        </table></div>
      </section>;
    })}
  </section>;
}
