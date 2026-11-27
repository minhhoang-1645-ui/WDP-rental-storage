import { useCallback, useState } from 'react';
import { Stack, useFocusEffect } from 'expo-router';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Bell, CalendarDays, ChevronDown, ChevronUp, Clock, Coins, CreditCard, FileText, KeyRound, ShieldCheck, Tag, Warehouse, type LucideIcon } from 'lucide-react-native';
import { CustomerReveal } from '@/components/customer-flow';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { useResource } from '@/operations/use-resource';
import { object, rows, text, type Row } from '@/operations/model';
import { formatMoney } from '@/utils/format';

const groups = [
  { title: 'Đặt thuê và tiền cọc', summary: 'Thời gian giữ đơn, các khoản thanh toán và ưu đãi.', icon: CreditCard, keys: ['reservationHoldMinutes', 'deposit', 'prepaid'] },
  { title: 'Hủy đơn và hoàn tiền', summary: 'Điều kiện hủy, tỷ lệ hoàn tiền thuê và thời hạn xử lý.', icon: FileText, keys: ['cancellation'] },
  { title: 'Nhận kho và sử dụng kho', summary: 'Điều kiện nhận chìa khóa và ngày được sử dụng kho.', icon: KeyRound, keys: ['handoverLeadDays'] },
  { title: 'Gia hạn hợp đồng', summary: 'Khi nào có thể gia hạn và giá áp dụng cho kỳ mới.', icon: CalendarDays, keys: ['renewal', 'renewalReminderDays'] },
  { title: 'Trả kho và quyết toán', summary: 'Báo trước, trả trước hạn và hoàn tiền cọc.', icon: Warehouse, keys: ['returnNoticeDays', 'earlyReturn', 'depositRefund'] },
  { title: 'Quá hạn và các khoản phí', summary: 'Khoảng thời gian cho phép quá hạn và cách tính phí.', icon: Bell, keys: ['paymentReminderDays', 'paymentOverdue', 'returnOverdue'] },
];

const policyCopy: Record<string, { title: string; description: string }> = {
  reservationHoldMinutes: { title: 'Đơn chưa thanh toán được giữ bao lâu?', description: 'Thời hạn giữ kho tính từ lúc đơn được xác nhận. Hãy xem hạn thanh toán cụ thể trên đơn của bạn.' },
  deposit: { title: 'Tôi cần thanh toán những khoản nào?', description: 'Kiểm tra tiền thuê, tiền cọc và dịch vụ đã chọn trong báo giá. Mức cọc phụ thuộc vào loại kho và kỳ thuê.' },
  prepaid: { title: 'Khi nào được giảm giá?', description: 'Ưu đãi áp dụng trên phần tiền thuê trả trước đủ điều kiện theo kỳ thuê.' },
  cancellation: { title: 'Tôi có thể hủy đơn và nhận hoàn tiền khi nào?', description: 'Bạn có thể tự hủy đơn chưa thanh toán nếu chưa xác nhận hợp đồng, chưa có lịch bàn giao đang mở và chưa có giao dịch đang xử lý.\n\nVới đơn đã thanh toán đầy đủ, bạn có thể gửi yêu cầu hủy nếu kho chưa được sử dụng. Nếu đã nhận chìa khóa hoặc thiết bị, cơ sở cần xác nhận thu hồi trước khi duyệt. Khi đã sử dụng kho, hãy gửi yêu cầu trả kho.\n\nTỷ lệ dưới đây chỉ áp dụng cho tiền thuê. Khoản hoàn còn gồm tiền cọc đã thu và tiền dịch vụ đủ điều kiện chưa bàn giao.' },
  handoverLeadDays: { title: 'Khi nào tôi có thể nhận chìa khóa?', description: 'Trước khi nhận kho, bạn cần xác nhận hợp đồng, thanh toán đầy đủ hóa đơn ban đầu và có kho đã được phân bổ. Bạn chỉ được sử dụng kho từ ngày bắt đầu thuê, kể cả khi nhận chìa khóa sớm.' },
  renewal: { title: 'Khi nào tôi có thể gửi yêu cầu gia hạn?', description: 'Kiểm tra khoảng thời gian gửi yêu cầu và giá áp dụng cho kỳ gia hạn mới.' },
  renewalReminderDays: { title: 'Nhắc trước khi hợp đồng hết hạn', description: 'Số ngày nhắc trước khi hợp đồng hết hạn.' },
  returnNoticeDays: { title: 'Tôi cần báo trả kho trước bao lâu?', description: 'Hãy báo trước để cơ sở bố trí lịch. Bạn vẫn có thể trả đúng hạn mà không bị tính phí do báo muộn. Khi trả kho, hãy dọn đồ, trả chìa khóa hoặc thiết bị và hoàn tất các khoản còn phải thanh toán.' },
  earlyReturn: { title: 'Nếu trả kho trước hạn thì tính thế nào?', description: 'Gửi đề nghị để cơ sở kiểm tra điều kiện và xác nhận quyết toán. Phí trả trước hạn và việc tính lại ưu đãi là hai khoản được xem xét riêng.' },
  depositRefund: { title: 'Khi nào tiền cọc được xử lý?', description: 'Thời hạn tính từ ngày cơ sở ghi nhận đã nhận lại kho thực tế. Khoản cọc được đối chiếu với các khoản khấu trừ hợp lệ trước khi xác định số tiền hoàn.' },
  paymentReminderDays: { title: 'Nhắc trước hạn thanh toán', description: 'Số ngày nhắc trước hạn đối với hóa đơn còn phải thanh toán.' },
  paymentOverdue: { title: 'Nếu thanh toán muộn thì sao?', description: 'Sau thời gian cho phép quá hạn, phí theo điều khoản đã cam kết được tính một lần nếu có.' },
  returnOverdue: { title: 'Nếu trả kho muộn thì sao?', description: 'Phí sử dụng kho quá hạn tính từ sau thời gian cho phép đến ngày bàn giao thực tế, dựa trên tiền thuê theo ngày của kỳ đã cam kết.' },
};
const depositLabels = {
  locker: 'Tủ lưu trữ',
  smallDaily: 'Kho nhỏ thuê ngắn ngày',
  other: 'Các trường hợp còn lại',
};

function details(policy: Row): string[] {
  if (typeof policy.value === 'number') return text(policy, 'unit') ? [policy.value + ' ' + text(policy, 'unit')] : [];
  const v = object(policy.value);
  const n = (key: string) => text(v, key);
  const fee = (base: string) => v.feeMethod === 'NONE' ? 'Miễn phí' : v.feeMethod === 'FIXED_AMOUNT'
    ? formatMoney(Number(v.feeAmount)) : n('feeAmount') + '% ' + base;
  switch (policy.key) {
    case 'deposit':
      return Object.entries(depositLabels).flatMap(([key, label]) => {
        const rule = object(v[key]);
        const amount = text(rule, 'amount');
        const charge = rule.method === 'NONE' ? 'Không cọc' : rule.method === 'FIXED_AMOUNT' ? formatMoney(Number(amount)) + '/ô'
          : rule.method === 'RENT_PERCENTAGE' ? amount + '% tiền thuê trước giảm giá' : rule.method === 'MONTHLY_RENT_MULTIPLIER' ? amount + ' tháng tiền thuê/ô' : '';
        return charge ? [label + ' · ' + charge] : [];
      });
    case 'prepaid':
      return Object.entries(v).map(([term, rule]) => term + ' tháng · ' + (object(rule).enabled ? 'Giảm ' + text(object(rule), 'percent') + '%' : 'Không giảm'));
    case 'cancellation':
      if (!['farDays', 'nearDays', 'farPercent', 'middlePercent', 'nearPercent', 'startedPercent', 'refundDays'].every(key => typeof v[key] === 'number')) return [];
      return [`Trước ngày thuê từ ${n('farDays')} ngày · Hoàn ${n('farPercent')}% tiền thuê`,
        `Trước từ ${n('nearDays')} đến dưới ${n('farDays')} ngày · ${n('middlePercent')}% tiền thuê`,
        `Trước ngày thuê dưới ${n('nearDays')} ngày · ${n('nearPercent')}% tiền thuê`,
        `Từ ngày thuê, kho chưa sử dụng · ${n('startedPercent')}% tiền thuê`, `Hạn xử lý hoàn tiền · ${n('refundDays')} ngày từ ngày yêu cầu được duyệt`];
    case 'renewal':
      if (typeof v.opensDaysBefore !== 'number' || typeof v.closesDaysBefore !== 'number' || !['CONTRACT_RATE', 'CURRENT_LIST_PRICE'].includes(n('priceMode'))) return [];
      return [`Mở trước ngày hết hạn ${n('opensDaysBefore')} ngày`, `Đóng trước ngày hết hạn ${n('closesDaysBefore')} ngày`,
        v.priceMode === 'CONTRACT_RATE' ? 'Áp dụng giá hợp đồng' : 'Áp dụng giá niêm yết hiện hành'];
    case 'earlyReturn':
      if (!n('feeMethod') || !n('refundMode')) return [];
      return ['Phí trả trước hạn · ' + fee('tiền thuê chưa sử dụng'), v.refundMode === 'NONE' ? 'Không hoàn tiền thuê trả trước' : v.refundMode === 'ORIGINAL_DISCOUNT' ? 'Hoàn theo giá đã giảm' : 'Tính lại tiền thuê đã sử dụng theo ưu đãi của kỳ thực tế, dựa trên bảng giá đã cam kết.'];
    case 'paymentOverdue':
      if (typeof v.graceDays !== 'number' || !n('feeMethod')) return [];
      return [`Cho phép quá hạn ${n('graceDays')} ngày`, 'Phí quá hạn · ' + fee('tiền thuê còn nợ')];
    case 'returnOverdue':
      if (typeof v.graceDays !== 'number' || typeof v.multiplier !== 'number') return [];
      return [`Cho phép quá hạn ${n('graceDays')} ngày`, `Phí mỗi ngày tính phí · ${n('multiplier')}% tiền thuê theo ngày`];
    default:
      return [];
  }
}

const blue = '#175CD3';
const ink = '#101828';
const muted = '#475467';
const border = '#E4E7EC';
const tint = '#E8F2FE';
const formatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Ho_Chi_Minh',
});

const icons: Record<string, LucideIcon> = {
  reservationHoldMinutes: Clock, deposit: ShieldCheck, prepaid: Tag, cancellation: FileText,
  handoverLeadDays: KeyRound, returnNoticeDays: CalendarDays, renewal: CalendarDays, earlyReturn: FileText, depositRefund: Coins,
  renewalReminderDays: Bell, paymentReminderDays: Bell, paymentOverdue: Coins, returnOverdue: Warehouse,
};

function holdLabel(minutes: unknown) {
  if (typeof minutes !== 'number') return '';
  return minutes % 60 === 0 ? minutes / 60 + ' giờ' : minutes + ' phút';
}

function dayLabel(days: unknown) {
  return typeof days === 'number' ? days + ' ngày' : '';
}

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return <View style={s.icon}><Icon size={19} color={blue} strokeWidth={2} /></View>;
}

function PolicyRow({ policy, last }: { policy: Row; last: boolean }) {
  const key = text(policy, 'key');
  const values = details(policy);
  const effectiveFrom = Date.parse(text(policy, 'effectiveFrom'));
  const { title, description } = policyCopy[key];
  const hold = key === 'reservationHoldMinutes' ? holdLabel(policy.value) : '';
  const badge = hold || (typeof policy.value === 'number' ? values[0] : '');
  return <View style={[s.policy, !last && s.divider]}>
    <IconTile icon={icons[key] ?? FileText} />
    <View style={s.body}>
      <View style={s.policyHeader}>
        <View style={s.body}>
          <Text style={s.title}>{title}</Text>
          <Text style={s.copy}>{description}</Text>
        </View>
        {badge ? <View style={s.badge}>
          <Text selectable style={s.badgeText}>{badge}</Text>
        </View> : null}
      </View>
      {key === 'deposit' && values.length > 0 ? <View style={s.table}>
        {values.map((line, index) => {
          const [label, value] = line.split(' · ');
          return <View key={label} style={[s.tableRow, index > 0 && s.tableDivider]}>
            <Text style={[s.cell, s.cellLabel]}>{label}</Text><Text style={s.cell}>{value}</Text>
          </View>;
        })}
      </View> : null}
      {key === 'prepaid' && values.length > 0 ? <View style={s.chips}>
        {values.map(line => {
          const [term, discount] = line.split(' · ');
          return <View key={term} style={s.chip}>
            <Text style={s.chipTerm}>{term}</Text>
            <Text style={discount.startsWith('Giảm') ? s.discount : s.copy}>{discount}</Text>
          </View>;
        })}
      </View> : null}
      {!badge && key !== 'deposit' && key !== 'prepaid'
        ? values.map(line => <Text key={line} selectable style={s.value}>{line}</Text>) : null}
      {Number.isFinite(effectiveFrom) ? <Text style={s.meta}>Áp dụng từ {formatter.format(effectiveFrom)} (UTC+7)</Text>
        : policy.isDefault === true ? <Text style={s.meta}>Mặc định</Text> : null}
    </View>
  </View>;
}

export default function CustomerPolicies() {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 350 || fontScale > 1.25;
  const [openGroups, setOpenGroups] = useState(() => groups.map((_, index) => index === 0));
  const resource = useResource<Row>('/business-policies/applied/customer', false, true);
  const { refresh } = resource;
  useFocusEffect(useCallback(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [refresh]));
  const policies = new Map([...rows(resource.data?.items), ...rows(resource.data?.pricing)]
    .filter(policy => Object.hasOwn(policyCopy, text(policy, 'key')))
    .map(policy => [text(policy, 'key'), policy] as const));
  if (typeof resource.data?.depositRefundDays === 'number') {
    policies.set('depositRefund', { key: 'depositRefund', value: resource.data.depositRefundDays, unit: 'ngày' });
  }
  const hold = holdLabel(policies.get('reservationHoldMinutes')?.value);
  const notice = dayLabel(policies.get('returnNoticeDays')?.value);
  const cancellationDays = dayLabel(object(policies.get('cancellation')?.value).refundDays);
  const milestones = [
    { icon: Clock, label: 'Giữ đơn chưa thanh toán', value: hold },
    { icon: CalendarDays, label: 'Báo trước khi trả kho', value: notice },
    { icon: Coins, label: 'Xử lý hoàn tiền hủy đơn sau duyệt', value: cancellationDays },
  ].filter(item => item.value);
  return <ScrollView style={s.screen} contentContainerStyle={s.page} contentInsetAdjustmentBehavior="automatic">
    <Stack.Screen options={{ title: 'Chính sách thuê kho', headerTitleAlign: 'center', headerTitleStyle: { color: blue, fontSize: 19, fontWeight: '800' } }} />
    <View style={s.hero}>
      <Text style={s.copy}>Quy định hiện hành của NestBox. Xem đơn đặt kho, hợp đồng hoặc hóa đơn để biết điều khoản áp dụng cho hồ sơ của bạn.</Text>
    </View>
    {resource.loading ? <LoadingState label="Đang tải chính sách…" /> : resource.error
      ? <ErrorState message={resource.status === 404 ? 'Máy chủ chưa cung cấp mục chính sách thuê kho. Vui lòng thử lại sau.' : 'Hiện chưa tải được chính sách thuê kho. Vui lòng thử lại.'} onRetry={resource.refresh} />
      : policies.size === 0 ? <EmptyState title="Chưa có chính sách để hiển thị" message="Các chính sách thuê kho sẽ xuất hiện tại đây khi có dữ liệu." />
      : <>
        {milestones.length > 0 ? <View style={[s.card, s.summary]}>
          <View style={s.summaryTitle}><ShieldCheck size={20} color={blue} /><Text accessibilityRole="header" style={s.groupTitle}>Những mốc quan trọng</Text></View>
          <View style={[s.milestones, compact && s.milestonesCompact]}>
            {milestones.map((item, index) => <View key={item.label} style={[s.milestone, compact && s.milestoneCompact, index > 0 && (compact ? s.dividerAbove : s.verticalDivider)]}>
              <IconTile icon={item.icon} />
              <View style={compact && s.body}><Text style={s.milestoneValue}>{item.value}</Text><Text style={s.copy}>{item.label}</Text></View>
            </View>)}
          </View>
        </View> : null}
        {groups.map((group, index) => {
          const entries = group.keys.flatMap(key => policies.has(key) ? [policies.get(key)!] : []);
          if (!entries.length) return null;
          const expanded = openGroups[index];
          const Chevron = expanded ? ChevronUp : ChevronDown;
          return <View key={group.title} style={s.card}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded }} aria-expanded={expanded} accessibilityLabel={group.title}
              accessibilityHint={expanded ? 'Thu gọn nhóm chính sách' : group.summary}
              onPress={() => setOpenGroups(previous => previous.map((open, position) => position === index ? !open : open))}
              style={({ pressed }) => [s.groupHeader, expanded && s.groupOpen, pressed && s.pressed]}>
              <IconTile icon={group.icon} />
              <View style={s.body}><Text style={s.groupTitle}>{group.title}</Text>
                <Text style={s.meta}>{group.summary}</Text>
              </View>
              <Chevron size={19} color={blue} />
            </Pressable>
            {expanded ? <View style={s.groupBody}><CustomerReveal>
              {entries.map((policy, position) => <PolicyRow key={text(policy, 'key')} policy={policy} last={position === entries.length - 1} />)}
            </CustomerReveal></View> : null}
          </View>;
        })}
      </>}
  </ScrollView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FC' },
  page: { padding: 12, paddingBottom: 20, gap: 10 },
  hero: { paddingHorizontal: 5, paddingTop: 5, paddingBottom: 3, gap: 4 },
  card: { backgroundColor: 'white', borderWidth: 1, borderColor: border, borderRadius: 15, overflow: 'hidden', boxShadow: '0px 2px 5px rgba(16, 24, 40, 0.06)' },
  summary: { padding: 10, gap: 9 },
  summaryTitle: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  milestones: { flexDirection: 'row' },
  milestonesCompact: { flexDirection: 'column' },
  milestone: { flex: 1, minWidth: 0, gap: 5, paddingHorizontal: 7 },
  milestoneCompact: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  milestoneValue: { color: blue, fontSize: 17, fontWeight: '800' },
  verticalDivider: { borderLeftWidth: 1, borderLeftColor: border },
  dividerAbove: { borderTopWidth: 1, borderTopColor: border },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 48, paddingVertical: 7, paddingHorizontal: 10 },
  groupOpen: { backgroundColor: tint },
  pressed: { backgroundColor: '#DCEBFC' },
  groupTitle: { flexShrink: 1, color: ink, fontSize: 15, fontWeight: '800' },
  groupBody: { paddingHorizontal: 10 },
  policy: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, gap: 8 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border },
  policyHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 6 },
  body: { flex: 1, minWidth: 0, gap: 3 },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' },
  title: { color: ink, fontSize: 14, fontWeight: '800' },
  copy: { color: muted, fontSize: 12, lineHeight: 17 },
  meta: { color: muted, fontSize: 11, lineHeight: 15 },
  value: { color: ink, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  badge: { alignItems: 'center', maxWidth: '40%', backgroundColor: tint, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 5 },
  badgeText: { color: blue, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  table: { marginTop: 3, borderWidth: 1, borderColor: border, borderRadius: 9, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', backgroundColor: '#FAFBFC' },
  tableDivider: { borderTopWidth: 1, borderTopColor: border },
  cell: { flex: 1, color: ink, fontSize: 12, paddingHorizontal: 7, paddingVertical: 4 },
  cellLabel: { backgroundColor: '#F0F4FA', borderRightWidth: 1, borderRightColor: border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 3 },
  chip: { flexGrow: 1, flexBasis: '29%', borderRadius: 9, backgroundColor: '#EAF7EF', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 6 },
  chipTerm: { color: ink, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  discount: { color: '#087328', fontSize: 13, fontWeight: '800', textAlign: 'center' },
});
