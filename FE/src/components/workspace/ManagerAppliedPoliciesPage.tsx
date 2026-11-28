import { Bell, CreditCard, Handshake } from 'lucide-react';
import { pricingPolicySummary, type PricingPolicy } from '../../pages/operations/PricingPolicyFields';
import { AppliedPolicyTable, useAppliedPolicyCatalog, type PolicyEffectivity, type PolicyGroup } from './AppliedPolicyTable';

type PolicyInfo = PolicyEffectivity & { key: string; title: string; description: string };
type Catalog = {
  items: (PolicyInfo & { value: number; unit: string })[];
  pricing: (PolicyInfo & PricingPolicy)[];
  depositRefundDays?: number;
};

const groups: PolicyGroup[] = [
  { label: 'Đặt kho và thanh toán', icon: CreditCard, keys: ['reservationHoldMinutes', 'deposit', 'prepaid', 'cancellation'] },
  { label: 'Hợp đồng và bàn giao', icon: Handshake, keys: ['handoverLeadDays', 'renewal', 'returnNoticeDays', 'earlyReturn', 'depositRefund'] },
  { label: 'Quá hạn và nhắc nhở', icon: Bell, keys: ['renewalReminderDays', 'paymentReminderDays', 'paymentOverdue', 'returnOverdue'] },
];

export function ManagerAppliedPoliciesPage() {
  const resource = useAppliedPolicyCatalog<Catalog>();
  const policies = [...(resource.data?.items ?? []), ...(resource.data?.pricing ?? [])].map(policy => {
    if ('unit' in policy) {
      const { value, unit } = policy;
      return { ...policy, display: unit === 'phút' && value >= 60 && value % 60 === 0 ? value / 60 + ' giờ' : value + ' ' + unit };
    }
    const summary = pricingPolicySummary(policy.key, policy.value);
    const display = ['renewal', 'prepaid'].includes(policy.key) ? summary.split(' · ').join('\n') : summary;
    return { ...policy, display };
  });
  const depositRefundDays = resource.data?.depositRefundDays;
  return <AppliedPolicyTable groups={groups} resource={resource} showVersion
    description="Chính sách hiện hành của NestBox. Hồ sơ đã xác nhận áp dụng điều khoản đã cam kết theo từng nghiệp vụ."
    policies={typeof depositRefundDays === 'number' ? [...policies, {
      key: 'depositRefund', title: 'Hạn xử lý hoàn cọc khi trả kho',
      description: 'Tính từ ngày cơ sở ghi nhận đã nhận lại kho thực tế đối với hồ sơ có tiền cọc.',
      display: depositRefundDays + ' ngày', effectiveFrom: null, isDefault: false,
    }] : policies} />;
}
