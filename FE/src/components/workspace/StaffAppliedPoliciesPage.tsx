import { Bell, CalendarDays, Handshake } from 'lucide-react';
import { AppliedPolicyTable, useAppliedPolicyCatalog, type PolicyEffectivity, type PolicyGroup } from './AppliedPolicyTable';

type OperationalValue = number | { opensDaysBefore: number; closesDaysBefore: number } | { graceDays: number; managerDays: number };
type Entry = PolicyEffectivity & { key: string; title: string; value: OperationalValue };

const groups: PolicyGroup[] = [
  { label: 'Nhận kho và bàn giao', icon: Handshake, keys: ['handoverLeadDays'] },
  { label: 'Gia hạn và trả kho', icon: CalendarDays, keys: ['renewal', 'renewalReminderDays', 'returnNoticeDays'] },
  { label: 'Quá hạn và xử lý', icon: Bell, keys: ['paymentReminderDays', 'paymentOverdue', 'returnOverdue'] },
];

const descriptions: Record<string, string> = {
  handoverLeadDays: 'Khách có thể nhận chìa khóa sớm theo chính sách. Khách chỉ được sử dụng kho từ ngày bắt đầu thuê. Trước khi bàn giao, kiểm tra hợp đồng đã được xác nhận, thanh toán đã hoàn tất và kho đã được phân bổ.',
  renewal: 'Hướng dẫn khách gửi yêu cầu trong khoảng thời gian này trước khi hợp đồng hết hạn.',
  renewalReminderDays: 'Số ngày trước khi hợp đồng hết hạn mà hệ thống gửi nhắc nhở.',
  returnNoticeDays: 'Dùng để bố trí lịch nhận lại kho. Báo muộn vẫn được trả đúng hạn mà không phát sinh phí do báo muộn.',
  paymentReminderDays: 'Số ngày nhắc trước hạn cho hóa đơn còn phải thanh toán.',
  paymentOverdue: 'Đối chiếu ngày đến hạn của hóa đơn và chuyển Manager khi đến mốc xử lý.',
  returnOverdue: 'Đối chiếu ngày kết thúc kỳ thuê và báo Manager khi đến mốc xử lý.',
};

function operationalValue(value: OperationalValue) {
  if (typeof value === 'number') return value + ' ngày';
  if ('graceDays' in value) return [
    value.graceDays ? 'Cho phép quá hạn ' + value.graceDays + ' ngày' : 'Không có thời gian cho phép quá hạn',
    'Báo Manager khi quá hạn ' + value.managerDays + ' ngày',
  ].join('\n');
  return 'Mở trước ngày hết hạn ' + value.opensDaysBefore + ' ngày\nĐóng trước ngày hết hạn ' + value.closesDaysBefore + ' ngày';
}

export function StaffAppliedPoliciesPage() {
  const resource = useAppliedPolicyCatalog<{ entries: Entry[] }>();
  const policies = (resource.data?.entries ?? []).map(entry => ({
    ...entry, display: operationalValue(entry.value), description: descriptions[entry.key],
  }));
  return <AppliedPolicyTable groups={groups} policies={policies} resource={resource}
    description="Tra cứu quy định để bàn giao, nhận kho trả và hỗ trợ khách. Chuyển Manager xử lý khi cần quyết định hoàn tiền, khấu trừ cọc hoặc thay đổi điều khoản." />;
}
