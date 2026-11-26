import { useCallback, useState } from 'react';
import { Stack, useFocusEffect } from 'expo-router';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Bell, CalendarDays, ChevronDown, ChevronUp, Clock, Coins, CreditCard, FileText, Handshake, KeyRound, ShieldCheck, Tag, Warehouse, type LucideIcon } from 'lucide-react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { CustomerReveal } from '@/components/customer-flow';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { useResource } from '@/operations/use-resource';
import { object, rows, text, type Row } from '@/operations/model';
import { formatMoney } from '@/utils/format';

const groups = [
  { title: 'Đặt kho và thanh toán', icon: CreditCard, keys: ['reservationHoldMinutes', 'deposit', 'prepaid', 'cancellation'] },
  { title: 'Hợp đồng và bàn giao', icon: Handshake, keys: ['handoverLeadDays', 'returnNoticeDays', 'renewal', 'earlyReturn'] },
  { title: 'Quá hạn và nhắc nhở', icon: Bell, keys: ['renewalReminderDays', 'paymentReminderDays', 'paymentOverdue', 'returnOverdue'] },
];

function details(policy: Row): string[] {
  if (typeof policy.value === 'number') return text(policy, 'unit') ? [policy.value + ' ' + text(policy, 'unit')] : [];
  const v = object(policy.value);
  const n = (key: string) => text(v, key);
  const fee = (base: string) => v.feeMethod === 'NONE' ? 'Miễn phí' : v.feeMethod === 'FIXED_AMOUNT'
    ? formatMoney(Number(v.feeAmount)) : n('feeAmount') + '% ' + base;
  switch (policy.key) {
    case 'deposit':
      return Object.entries(v).map(([key, value]) => {
        const rule = object(value);
        const label = ({ locker: 'Tủ lưu trữ', smallDaily: 'Kho nhỏ thuê ngắn ngày', other: 'Các trường hợp còn lại' } as Record<string, string>)[key] ?? key;
        const amount = text(rule, 'amount');
        const charge = rule.method === 'NONE' ? 'Không cọc' : rule.method === 'FIXED_AMOUNT' ? formatMoney(Number(amount)) + '/ô'
          : rule.method === 'RENT_PERCENTAGE' ? amount + '% tiền thuê' : amount + ' tháng tiền thuê/ô';
        return label + ' · ' + charge;
      });
    case 'prepaid':
      return Object.entries(v).map(([term, rule]) => term + ' tháng · ' + (object(rule).enabled ? 'Giảm ' + text(object(rule), 'percent') + '%' : 'Không giảm'));
    case 'cancellation':
      if (!['farDays', 'nearDays', 'farPercent', 'middlePercent', 'nearPercent', 'startedPercent', 'refundDays'].every(key => typeof v[key] === 'number')) return [];
      return [`Trước ngày thuê từ ${n('farDays')} ngày · ${n('farPercent')}%`,
        `Trước từ ${n('nearDays')} đến dưới ${n('farDays')} ngày · ${n('middlePercent')}%`,
        `Trước ngày thuê dưới ${n('nearDays')} ngày · ${n('nearPercent')}%`,
        `Từ ngày thuê, kho chưa sử dụng · ${n('startedPercent')}%`, `Hạn hoàn tiền hủy đơn · ${n('refundDays')} ngày`];
    case 'renewal':
      if (typeof v.opensDaysBefore !== 'number' || typeof v.closesDaysBefore !== 'number' || !['CONTRACT_RATE', 'CURRENT_LIST_PRICE'].includes(n('priceMode'))) return [];
      return [`Mở trước ${n('opensDaysBefore')} ngày · Đóng trước ${n('closesDaysBefore')} ngày`,
        v.priceMode === 'CONTRACT_RATE' ? 'Áp dụng giá hợp đồng' : 'Áp dụng giá niêm yết hiện hành'];
    case 'earlyReturn':
      if (!n('feeMethod') || !n('refundMode')) return [];
      return [fee('tiền thuê chưa sử dụng'), v.refundMode === 'NONE' ? 'Không hoàn tiền thuê trả trước' : v.refundMode === 'ORIGINAL_DISCOUNT' ? 'Hoàn theo giá đã giảm' : 'Tính lại ưu đãi theo bảng đã cam kết'];
    case 'paymentOverdue':
      if (typeof v.graceDays !== 'number' || !n('feeMethod')) return [];
      return [`Cho phép quá hạn ${n('graceDays')} ngày`, fee('tiền thuê còn nợ')];
    case 'returnOverdue':
      if (typeof v.graceDays !== 'number' || typeof v.multiplier !== 'number') return [];
      return [`Cho phép quá hạn ${n('graceDays')} ngày · Hệ số phí ${n('multiplier')}%`];
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
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh',
});

const icons: Record<string, LucideIcon> = {
  reservationHoldMinutes: Clock, deposit: ShieldCheck, prepaid: Tag, cancellation: FileText,
  handoverLeadDays: KeyRound, returnNoticeDays: CalendarDays, renewal: CalendarDays, earlyReturn: FileText,
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

function WarehouseIllustration() {
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.illustration}>
    <Svg width="100%" height="100%" viewBox="0 0 150 106">
      <Path d="M4 101C0 80 12 63 27 60C26 38 49 15 78 16C107 14 134 29 145 55L149 101Z" fill="#E7F2FF" />
      <Path d="M53 39L119 23L140 40V101H53Z" fill="#C2D8F1" />
      <Path d="M53 39L119 23V101H53Z" fill="#F5FAFF" />
      <Path d="M56 41L118 26L139 42" fill="none" stroke="#ADC8E9" strokeWidth="3" />
      <Path d="M63 53L112 42V101H63Z" fill="#103F79" />
      <Path d="M63 53L112 42V70L63 79Z" fill="#176ADF" />
      <Path d="M64 58L111 48M64 64L111 54M64 71L111 60" stroke="#4D9DFA" strokeWidth="1.5" />
      <Rect x="74" y="85" width="17" height="16" fill="#EAB273" />
      <Rect x="91" y="80" width="16" height="21" fill="#D9944D" />
      <Rect x="86" y="71" width="16" height="12" fill="#F3C288" />
      <Path d="M36 95Q20 86 24 76Q32 75 36 91Q33 72 41 67Q48 74 39 93Q48 81 53 83Q51 95 36 97Z" fill="#58BA86" />
      <Path d="M29 94H45L43 103H31Z" fill="#327ADA" />
    </Svg>
  </View>;
}

function PolicyRow({ policy, last }: { policy: Row; last: boolean }) {
  const key = text(policy, 'key');
  const values = details(policy);
  const effectiveFrom = Date.parse(text(policy, 'effectiveFrom'));
  const version = text(policy, 'effectiveVersion');
  const hold = key === 'reservationHoldMinutes' ? holdLabel(policy.value) : '';
  const badge = hold || (typeof policy.value === 'number' ? values[0] : '');
  return <View style={[s.policy, !last && s.divider]}>
    <IconTile icon={icons[key] ?? FileText} />
    <View style={s.body}>
      <View style={s.policyHeader}>
        <View style={s.body}>
          <Text style={s.title}>{text(policy, 'title')}</Text>
          {text(policy, 'description') ? <Text style={s.copy}>{text(policy, 'description')}</Text> : null}
        </View>
        {badge ? <View style={s.badge}>
          <Text style={s.badgeText}>{badge}</Text>
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
        ? values.map(line => <Text key={line} style={s.value}>{line}</Text>) : null}
      {(Number.isFinite(effectiveFrom) || version === '0') && <View style={s.effectivity}>
        <View style={s.effectivityHeader}>
          <CalendarDays size={15} color={blue} />
          <Text style={s.effectivityLabel}>Hiệu lực</Text>
        </View>
        {Number.isFinite(effectiveFrom) ? <>
          <Text style={s.effectivityValue}>Áp dụng từ {formatter.format(effectiveFrom)} (UTC+7)</Text>
          {Number(version) > 0 && <Text style={s.effectivityVersion}>Phiên bản {version} đang áp dụng</Text>}
        </> : <Text style={s.effectivityValue}>Đang dùng thiết lập ban đầu</Text>}
      </View>}
    </View>
  </View>;
}

export default function CustomerPolicies() {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 350 || fontScale > 1.25;
  const [openGroups, setOpenGroups] = useState([true, false, false]);
  const resource = useResource<Row>('/business-policies/applied', false, true);
  const { refresh } = resource;
  useFocusEffect(useCallback(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [refresh]));
  const policies = new Map([...rows(resource.data?.items), ...rows(resource.data?.pricing)]
    .filter(policy => icons[text(policy, 'key')] && text(policy, 'title'))
    .map(policy => [text(policy, 'key'), policy] as const));
  const hold = holdLabel(policies.get('reservationHoldMinutes')?.value);
  const notice = dayLabel(policies.get('returnNoticeDays')?.value);
  const grace = dayLabel(object(policies.get('paymentOverdue')?.value).graceDays);
  const milestones = [
    { icon: Clock, label: 'Giữ đơn chưa thanh toán', value: hold },
    { icon: CalendarDays, label: 'Báo trước khi trả kho', value: notice },
    { icon: Coins, label: 'Số ngày cho phép quá hạn thanh toán', value: grace },
  ].filter(item => item.value);
  const summaries = [
    '',
    [dayLabel(policies.get('handoverLeadDays')?.value) && 'Nhận chìa khóa sớm ' + dayLabel(policies.get('handoverLeadDays')?.value), notice && 'Báo trả kho trước ' + notice].filter(Boolean).join(' · '),
    grace ? 'Số ngày cho phép quá hạn thanh toán ' + grace : '',
  ];

  return <ScrollView style={s.screen} contentContainerStyle={s.page}>
    <Stack.Screen options={{ title: 'Chính sách thuê kho', headerTitleAlign: 'center', headerTitleStyle: { color: blue, fontSize: 19, fontWeight: '800' } }} />
    <View style={[s.hero, !compact && s.heroWithArt]}>
      {!compact ? <WarehouseIllustration /> : null}
      <Text accessibilityRole="header" style={s.heroTitle}>Chính sách thuê kho của NestBox</Text>
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
              accessibilityHint={expanded ? 'Thu gọn nhóm chính sách' : summaries[index] || 'Mở nhóm chính sách'}
              onPress={() => setOpenGroups(previous => previous.map((open, position) => position === index ? !open : open))}
              style={({ pressed }) => [s.groupHeader, expanded && s.groupOpen, pressed && s.pressed]}>
              <IconTile icon={group.icon} />
              <View style={s.body}><Text style={s.groupTitle}>{group.title}</Text>
                {!expanded && summaries[index] ? <Text style={s.meta}>{summaries[index]}</Text> : null}
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
  heroWithArt: { paddingRight: '30%' },
  heroTitle: { color: ink, fontSize: 19, lineHeight: 24, fontWeight: '800' },
  illustration: { position: 'absolute', width: '30%', height: '100%', bottom: 0, right: 0 },
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
  effectivity: { backgroundColor: '#F4F8FD', borderWidth: 1, borderColor: border, borderRadius: 9, padding: 9, marginTop: 6, gap: 4 },
  effectivityHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  effectivityLabel: { color: blue, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  effectivityValue: { color: ink, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  effectivityVersion: { color: muted, fontSize: 12, lineHeight: 17 },
  meta: { color: muted, fontSize: 11, lineHeight: 15 },
  value: { color: ink, fontSize: 12, lineHeight: 17 },
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
