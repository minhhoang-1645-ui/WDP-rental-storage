import { useState } from 'react';
import type { ReactNode } from 'react';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { Banknote, Building2, Check, ChevronRight, CircleCheck, ClipboardList, Coins, FileText, History, Info, Search, Warehouse } from 'lucide-react-native';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { at, idOf, label, rows, text, type Row } from '@/operations/model';
import { useResource } from '@/operations/use-resource';
import { formatDate, formatMoney } from '@/utils/format';
import { recordMatches } from '@/utils/record-search';
import { EmptyState, ErrorState, LoadingState } from './screen-state';

const base = '/customer/deposit-settlements';
const blue = '#0758DC';
const ink = '#141832';
const muted = '#46536C';
const green = '#087438';
const border = '#DCE3EF';
const detailPath = (id: string) => base + '/' + encodeURIComponent(id);
const currency = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? formatMoney(value) : '—';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const finalized = (row: Row) => ['APPROVED', 'AWAITING_OUTSTANDING_PAYMENT', 'SETTLED'].includes(String(row.status));

function refund(row: Row) {
  const method = text(row, 'refundRecord.method');
  const recordedAt = text(row, 'refundRecord.recordedAt');
  if ((method !== 'BANK_TRANSFER' && method !== 'CASH') || !Number.isFinite(Date.parse(recordedAt)) || !(Number(row.refundAmount) > 0)) return null;
  return { method, recordedAt, referenceSuffix: text(row, 'refundRecord.referenceSuffix') };
}

function refundLabel(row: Row) {
  const record = refund(row);
  if (record) return record.method === 'BANK_TRANSFER' ? 'Đã ghi nhận chuyển tiền' : 'Đã ghi nhận hoàn tiền mặt';
  if (text(row, 'refundedAt')) return 'Chưa đủ thông tin hoàn tiền';
  if (!finalized(row)) return 'Chờ kết quả quyết toán';
  if (row.refundAmount === 0) return 'Không có khoản hoàn';
  return row.status === 'APPROVED' && Number(row.refundAmount) > 0 ? 'Chờ hoàn tiền' : 'Chưa có ghi nhận hoàn tiền';
}

function unitCodes(row: Row) {
  return [...new Set(Array.isArray(row.unitCodes) ? row.unitCodes.filter((code): code is string => typeof code === 'string' && Boolean(code)) : [])];
}

function storageName(row: Row) {
  return text(row, 'reservation.storageType.name') || 'Kho thuê';
}

function Header({ title }: { title: string }) {
  return <Stack.Screen options={{ title, headerTitleAlign: 'center', headerTitleStyle: { color: blue, fontSize: 20, fontWeight: '700' } }} />;
}

const filters = ['Tất cả', 'Đang xử lý', 'Đã hoàn'] as const;

export function CustomerDepositList() {
  const { returnCode } = useLocalSearchParams<{ returnCode?: string }>();
  const source = useResource<Row>(base, true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof filters)[number]>('Tất cả');
  const records = [...new Map(rows(source.data?.items).filter(row => idOf(row)).map(row => [idOf(row), row])).values()];
  const scoped = returnCode ? records.filter(row => text(row, 'returnCode') === returnCode) : records;
  const shown = scoped.filter(row => {
    const hasRefundRecord = Boolean(refund(row));
    const pending = !hasRefundRecord && (['PENDING_REVIEW', 'APPROVED', 'AWAITING_OUTSTANDING_PAYMENT'].includes(String(row.status)) ||
      (row.status === 'SETTLED' && Number(row.refundAmount) > 0));
    const statusMatch = filter === 'Tất cả' || (filter === 'Đã hoàn' ? hasRefundRecord : pending);
    return statusMatch && recordMatches([storageName(row), unitCodes(row)], query);
  });
  return <View style={s.screen}>
    <Header title="Tiền cọc" />
    <FlatList data={shown} keyExtractor={idOf} refreshing={source.loading && !!source.data} onRefresh={source.refresh}
      keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}
      ListHeaderComponent={<View style={s.listHead}>
        <Text accessibilityRole="header" style={s.listTitle}>Các khoản cọc của tôi</Text>
        <View style={s.search}><Search size={19} color={muted} /><TextInput accessibilityLabel="Tìm kho" value={query} onChangeText={setQuery}
          placeholder="Tìm kho, ví dụ: B12, E06..." placeholderTextColor={muted} style={s.input} returnKeyType="search" /></View>
        <View style={s.filters}>{filters.map(option => <Pressable key={option} accessibilityRole="button"
          accessibilityState={{ selected: option === filter }} onPress={() => setFilter(option)} style={[s.filter, option === filter && s.filterActive]}>
          <Text style={[s.filterText, option === filter && s.white]}>{option}</Text>
        </Pressable>)}</View>
      </View>}
      ListEmptyComponent={source.error ? <ErrorState message={source.error} onRetry={source.refresh} /> : source.loading ? <LoadingState layout="list" />
        : <EmptyState title={scoped.length ? 'Không tìm thấy khoản cọc phù hợp' : returnCode ? 'Chưa có khoản cọc cho lượt trả kho này' : 'Bạn chưa có khoản cọc để quyết toán'} message="" />}
      renderItem={({ item }) => {
        const returnedAt = text(item, 'physicallyReturnedAt');
        const paidBack = Boolean(refund(item));
        const status = paidBack ? 'Đã hoàn' : item.status === 'AWAITING_OUTSTANDING_PAYMENT'
          ? 'Chờ thanh toán bổ sung' : finalized(item) ? refundLabel(item) : 'Đang quyết toán';
        return <Pressable accessibilityRole="button" style={({ pressed }) => [s.record, pressed && s.pressed]}
          onPress={() => router.push(detailPath(idOf(item)) as Href)}>
          <IconBox><Warehouse size={20} color={blue} /></IconBox>
          <View style={s.grow}>
            <Text style={s.bold}>{storageName(item)}</Text>
            {unitCodes(item).length > 0 && <Text style={s.small}>{unitCodes(item).join(' · ')}</Text>}
            {returnedAt ? <Text style={s.small}>Trả kho: {formatDate(returnedAt)}</Text> : null}
            <Text style={[s.badge, paidBack ? s.green : s.yellow]}>{status}</Text>
          </View>
          <View style={s.amountColumn}><Text style={s.small}>Tiền cọc</Text><Text style={s.bold}>{currency(item.depositAmount)}</Text></View>
          <ChevronRight size={16} color={muted} />
        </Pressable>;
      }} />
  </View>;
}

type Screen = 'detail' | 'deductions' | 'refund';
const titles: Record<Screen, string> = { detail: 'Chi tiết quyết toán', deductions: 'Chi tiết khấu trừ', refund: 'Theo dõi hoàn tiền' };

export function CustomerDepositDetail({ id, view = 'detail' }: { id: string; view?: Screen }) {
  const source = useResource<Row>(id ? detailPath(id) : null);
  const row = source.data;
  return <View style={s.screen}>
    <Header title={titles[view]} />
    <ScrollView contentContainerStyle={s.page}>
      {source.error ? <ErrorState message={source.error} onRetry={source.refresh} /> : source.loading ? <LoadingState layout="detail" />
        : !row ? <EmptyState title="Không tìm thấy khoản cọc" message="" />
          : view === 'deductions' ? <DeductionDetails row={row} /> : view === 'refund' ? <RefundDetails row={row} /> : <SettlementDetails row={row} />}
    </ScrollView>
  </View>;
}

const returnPath = (row: Row) => {
  const key = text(row, 'returnId', 'returnCode');
  return key ? '/customer/returns/' + encodeURIComponent(key) : '';
};

function SettlementDetails({ row }: { row: Row }) {
  const approved = finalized(row);
  const refundAmount = approved ? currency(row.refundAmount) : 'Chờ đối chiếu';
  const outstanding = number(at(row, 'outstandingInvoice.balanceDue'));
  const payable = outstanding ?? (row.status === 'AWAITING_OUTSTANDING_PAYMENT' ? number(row.outstandingAmount) : undefined);
  const returnedAt = text(row, 'physicallyReturnedAt');
  const settledAt = text(row, 'settledAt', 'reviewedAt');
  const paidBack = refund(row);
  const id = encodeURIComponent(idOf(row));
  return <>
    <View style={s.hero}>
      <Coins size={39} color={blue} />
      <View style={s.grow}><Text style={s.bold}>Số tiền được hoàn</Text><Text style={s.heroAmount}>{refundAmount}</Text></View>
    </View>
    <View style={s.statuses}>
      <View style={[s.statusPanel, approved ? s.green : s.yellow]}>
        <CircleCheck size={20} color={approved ? green : '#8A5500'} />
        <View style={s.grow}><Text style={[s.bold, approved && s.greenText]}>{row.status === 'SETTLED' ? 'Đã quyết toán cọc'
          : row.status === 'AWAITING_OUTSTANDING_PAYMENT' ? 'Chờ thanh toán khoản thu thêm'
          : row.status === 'APPROVED' ? 'Đã duyệt khoản hoàn cọc' : 'Đang quyết toán cọc'}</Text>
          {settledAt ? <Text style={s.small}>{formatDate(settledAt)}</Text> : null}</View>
      </View>
      <View style={[s.statusPanel, s.blueSurface]}><Building2 size={21} color={blue} />
        <View style={s.grow}><Text style={[s.bold, s.blueText]}>{refundLabel(row)}</Text>
          {paidBack && <Text style={s.small}>{formatDate(paidBack.recordedAt)}</Text>}</View>
      </View>
    </View>
    <View style={s.section}>
      <Text accessibilityRole="header" style={s.bold}>Thông tin kho</Text>
      {returnPath(row) ? <Action icon={Warehouse} title={storageName(row)} detail={[unitCodes(row).join(' · '), returnedAt && 'Trả kho: ' + formatDate(returnedAt)].filter(Boolean).join('\n')}
        hint="Xem hồ sơ trả kho" path={returnPath(row)} /> : <Text style={s.body}>{storageName(row)}</Text>}
    </View>
    <View style={s.section}>
      <Text accessibilityRole="header" style={s.bold}>Chi tiết quyết toán</Text>
      <Fact title="Tiền cọc đã nộp" value={currency(row.depositAmount)} />
      <Fact title="Các khoản khấu trừ" value={approved ? currency(row.deductionAmount) : 'Chờ đối chiếu'} />
      <Fact title="Số tiền được hoàn" value={refundAmount} highlight={approved} />
      {text(row, 'refundDueOn') && row.status !== 'SETTLED' && row.status !== 'AWAITING_OUTSTANDING_PAYMENT' &&
        <Fact title="Hạn xử lý hoàn cọc" value={formatDate(text(row, 'refundDueOn'))} />}
      {row.refundOverdue === true && <Notice>Hồ sơ đã quá hạn xử lý. Bạn có thể theo dõi tình trạng hoàn cọc tại đây.</Notice>}
      {payable !== undefined && payable > 0 && <Fact title="Cần thanh toán bổ sung" value={currency(payable)} />}
    </View>
    <View style={s.actions}>
      <Action icon={FileText} title="Xem chi tiết khấu trừ" path={'/customer/deposit-deductions?id=' + id} />
      <View style={s.separator} />
      <Action icon={History} title="Theo dõi hoàn tiền" path={'/customer/deposit-refund?id=' + id} />
      {payable !== undefined && payable > 0 && text(row, 'outstandingInvoice.id') ? <>
        <View style={s.separator} /><Action icon={FileText} title="Xem hóa đơn bổ sung" path={'/customer/invoices/' + encodeURIComponent(text(row, 'outstandingInvoice.id'))} />
      </> : null}
    </View>
  </>;
}

function DeductionDetails({ row }: { row: Row }) {
  const [showInspection, setShowInspection] = useState(false);
  const inspection = useResource<Row>(showInspection ? returnPath(row) || null : null);
  const inspectionRows = rows(inspection.data?.inspections).filter(item => ['PASS', 'ISSUE_FOUND'].includes(String(item.result)));
  const approved = finalized(row);
  const deduction = number(row.deductionAmount);
  const charges = number(row.totalApprovedCharges);
  const items = rows(row.issues).filter(item => Number(item.approvedChargeAmount) > 0);
  return <>
    {!approved ? <Notice>Khoản khấu trừ đang được đối chiếu. Kết quả sẽ hiển thị sau khi được duyệt.</Notice>
      : deduction === 0 ? <View style={s.zero}>
        <View style={s.illustration}><ClipboardList size={67} color="#487CE7" strokeWidth={1.6} /><View style={s.illustrationCheck}><Check size={26} color="white" /></View></View>
        <Text accessibilityRole="header" style={s.listTitle}>Không có khoản khấu trừ</Text>
        <Text style={s.body}>Số tiền khấu trừ</Text><Text style={[s.zeroAmount, s.green]}>{currency(deduction)}</Text>
      </View> : <Fact title="Số tiền khấu trừ từ cọc" value={currency(deduction)} highlight />}
    {approved && items.length > 0 && <View style={s.section}>
      <Text accessibilityRole="header" style={s.bold}>Các khoản phí đã duyệt</Text>
      {items.map(item => <View key={text(item, 'inspectionId')} style={s.charge}>
        <View style={s.grow}><Text style={s.bold}>{label(text(item, 'approvedIssueType')) || 'Khoản phí đã duyệt'}</Text>
          {text(item, 'unit.unitCode') ? <Text style={s.small}>{text(item, 'unit.unitCode')}</Text> : null}
          {text(item, 'reason') ? <Text style={s.body}>{text(item, 'reason')}</Text> : null}
        </View><Text style={s.bold}>{currency(item.approvedChargeAmount)}</Text>
      </View>)}
      <Fact title="Tổng phí đã duyệt" value={currency(charges)} />
      {charges !== undefined && deduction !== undefined && charges > deduction && <Notice>Khoản phí vượt quá tiền cọc được đối chiếu riêng trong hóa đơn bổ sung.</Notice>}
    </View>}
    {returnPath(row) ? <View style={s.actions}>
      <Action icon={ClipboardList} title={showInspection ? 'Ẩn kết quả kiểm tra kho' : 'Kết quả kiểm tra kho'} onPress={() => setShowInspection(value => !value)} expanded={showInspection} />
      {showInspection && <View style={s.inspection}>
        {inspection.error ? <ErrorState message={inspection.error} onRetry={inspection.refresh} /> : inspection.loading ? <LoadingState layout="compact" />
          : inspectionRows.length ? inspectionRows.map(item => <Fact key={idOf(item)} title={text(item, 'unit.unitCode') || 'Kho đã kiểm tra'}
            value={item.result === 'PASS' ? 'Đạt' : 'Có vấn đề ghi nhận'} />) : <Text style={s.small}>Chưa có kết quả kiểm tra để hiển thị.</Text>}
      </View>}
    </View> : null}
  </>;
}

function RefundDetails({ row }: { row: Row }) {
  const record = refund(row);
  const returnedAt = text(row, 'physicallyReturnedAt');
  const reviewedAt = text(row, 'reviewedAt');
  const settledAt = text(row, 'settledAt');
  const events = [
    { key: 'returned', date: returnedAt, title: 'Đã trả kho', detail: 'Kho đã được bàn giao cho NestBox.' },
    { key: 'reviewed', date: reviewedAt, title: 'Đã đối chiếu cọc', detail: Number(row.refundAmount) > 0 ? 'Khoản hoàn đã được duyệt sau khi đối chiếu.' : 'Kết quả đối chiếu đã được lưu.' },
    { key: 'settled', date: settledAt !== record?.recordedAt && settledAt !== reviewedAt ? settledAt : '', title: 'Đã chốt quyết toán', detail: 'Hồ sơ quyết toán cọc đã đóng.' },
    { key: 'refund', date: record?.recordedAt ?? '', title: refundLabel(row), detail: 'Quản lý NestBox đã ghi nhận khoản hoàn.' },
  ].filter(event => Number.isFinite(Date.parse(event.date))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return <>
    {events.length > 0 && <View style={s.timeline}>{events.map((event, index) => <View key={event.key} style={s.event}>
      <View style={s.rail}><View style={s.eventCheck}><Check color="white" size={15} /></View>
        {index < events.length - 1 && <View style={s.line} />}
      </View>
      <View style={s.eventBody}><Text style={s.bold}>{event.title}</Text><Text style={s.small}>{formatDate(event.date, true)}</Text><Text style={s.small}>{event.detail}</Text></View>
    </View>)}</View>}
    <View style={s.hero}>
      <Banknote size={29} color={blue} /><View style={s.grow}>
        <Text style={s.bold}>{refundLabel(row)}</Text>
        {finalized(row) && <Text style={s.body}>{record ? 'Số tiền ghi nhận hoàn' : 'Số tiền được hoàn'}: {currency(row.refundAmount)}</Text>}
        {record && <Text style={s.small}>Phương thức: {record.method === 'BANK_TRANSFER' ? 'Chuyển khoản ngân hàng' : 'Tiền mặt'}</Text>}
        {record?.referenceSuffix ? <Text style={s.small}>Tham chiếu: •••• {record.referenceSuffix}</Text> : null}
      </View>
    </View>
    {record && <Notice>Khoản hoàn được ghi nhận thủ công. Hệ thống chưa có xác minh độc lập từ ngân hàng.</Notice>}
  </>;
}

function IconBox({ children }: { children: ReactNode }) { return <View style={s.icon}>{children}</View>; }

function Action({ title, detail, hint, icon: Icon, path, onPress, expanded }: {
  title: string; detail?: string; hint?: string; icon: typeof FileText; path?: string; onPress?: () => void; expanded?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityHint={hint} accessibilityState={expanded === undefined ? undefined : { expanded }}
    onPress={onPress ?? (() => { if (path) router.push(path as Href); })}
    style={({ pressed }) => [s.action, pressed && s.pressed]}>
    <IconBox><Icon color={blue} size={19} /></IconBox>
    <View style={s.grow}><Text style={s.bold}>{title}</Text>{detail ? <Text style={s.small}>{detail}</Text> : null}</View><ChevronRight size={17} color={muted} />
  </Pressable>;
}

function Fact({ title, value, highlight = false }: { title: string; value: string; highlight?: boolean }) {
  return <View style={[s.fact, highlight && s.highlight]}><Text style={[s.body, s.grow, highlight && s.highlightText]}>{title}</Text>
    <Text style={[s.bold, highlight && s.highlightText]}>{value}</Text></View>;
}

function Notice({ children }: { children: ReactNode }) {
  return <View style={s.notice}><Info size={18} color={blue} /><Text style={[s.small, s.grow]}>{children}</Text></View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF' },
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 12, width: '100%', maxWidth: 600, alignSelf: 'center' },
  grow: { flex: 1, minWidth: 0 },
  listHead: { gap: 14, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: border },
  listTitle: { color: ink, fontSize: 22, fontWeight: '800' },
  search: { borderWidth: 1, borderColor: border, borderRadius: 12, minHeight: 44, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, fontSize: 14, color: ink, minHeight: 42 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: { paddingHorizontal: 12, minHeight: 36, justifyContent: 'center', borderWidth: 1, borderColor: border, borderRadius: 20 },
  filterActive: { backgroundColor: blue, borderColor: blue },
  filterText: { color: ink, fontSize: 13, fontWeight: '600' },
  white: { color: '#FFF' },
  record: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: border },
  pressed: { backgroundColor: '#F2F6FE' },
  bold: { color: ink, fontSize: 14, fontWeight: '700' },
  body: { color: ink, fontSize: 14, lineHeight: 20 },
  small: { color: muted, fontSize: 12, lineHeight: 17 },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#ECF3FF' },
  amountColumn: { alignItems: 'flex-end', gap: 2 },
  badge: { alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, overflow: 'hidden', borderRadius: 12, fontSize: 12, fontWeight: '700', marginTop: 4 },
  green: { color: '#086032', backgroundColor: '#E1F6E8' },
  yellow: { color: '#764500', backgroundColor: '#FFF2CE' },
  greenText: { color: '#086032' },
  blueText: { color: blue },
  blueSurface: { backgroundColor: '#E9F1FF' },
  hero: { backgroundColor: '#E5EEFE', borderRadius: 12, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroAmount: { color: ink, fontSize: 27, fontWeight: '800', marginTop: 2 },
  statuses: { flexDirection: 'row', gap: 8 },
  statusPanel: { flex: 1, padding: 9, flexDirection: 'row', gap: 6, alignItems: 'flex-start', borderRadius: 10 },
  section: { gap: 5, borderTopWidth: StyleSheet.hairlineWidth, borderColor: border, paddingTop: 10 },
  actions: { borderWidth: 1, borderColor: border, borderRadius: 11, overflow: 'hidden' },
  action: { minHeight: 47, paddingHorizontal: 7, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 10 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: border },
  fact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28, gap: 10 },
  highlight: { marginTop: 3, minHeight: 36, backgroundColor: '#E6F7EB', borderRadius: 8, paddingHorizontal: 8 },
  highlightText: { color: '#086032', fontWeight: '700' },
  zero: { alignItems: 'center', gap: 12, paddingVertical: 20 },
  zeroAmount: { fontSize: 24, fontWeight: '800', borderRadius: 22, overflow: 'hidden', paddingVertical: 3, paddingHorizontal: 22 },
  illustration: { width: 118, height: 118, borderRadius: 59, backgroundColor: '#EEF4FF', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  illustrationCheck: { position: 'absolute', right: 13, bottom: 13, backgroundColor: '#487CE7', borderRadius: 21, padding: 5, borderColor: '#EEF4FF', borderWidth: 2 },
  notice: { backgroundColor: '#EEF3FD', borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  charge: { flexDirection: 'row', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: border },
  inspection: { padding: 10, gap: 4 },
  timeline: { paddingTop: 8 },
  event: { flexDirection: 'row', gap: 13 },
  rail: { width: 25, alignItems: 'center' },
  eventCheck: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#0B8948', alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, backgroundColor: '#AADDBF' },
  eventBody: { flex: 1, minWidth: 0, paddingBottom: 15, gap: 2 },
});
