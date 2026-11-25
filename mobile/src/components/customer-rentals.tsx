import { recordMatches } from '@/utils/record-search';
import { rentalChangePath } from '@/components/customer-rental-change';
import { openCreatedRenewal } from '@/components/customer-renewal';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { ArrowDownUp, Box, Building2, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, CircleCheck, FileText, Headphones, Layers, LogOut, MapPin, ReceiptText, Search, Warehouse, type LucideIcon } from 'lucide-react-native';
import { usePublicCatalog } from '@/hooks/use-public-catalog';
import { useResource } from '@/operations/use-resource';
import { idOf, object, rows, text, type Row } from '@/operations/model';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { CustomerActionRow } from '@/components/customer-premium';
import { CustomerNotifications } from './customer-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CustomerRecordActions } from '@/components/customer-record-actions';
import { StatusBadge } from '@/components/customer-ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { customerRentalActions } from '@/portals/actions';
import { supportPath } from '@/components/customer-support';
import type { FormAction } from '@/operations/form';
import { formatDate } from '@/utils/format';
import { currentTimeMs } from '@/utils/calendar-date';
import { isTransferRequest } from '@/utils/transfer-request';
import { CustomerRelocations } from '@/components/customer-relocations';

type Selection = { rental: Row; contract: Row };

function locationOf(contract: Row) {
  const floor = text(contract, 'unit.floor').replace(/^ground(?: floor)?$/i, 'Tầng trệt')
    .replace(/^(?:floor\s+)?(\d+)$/i, 'Tầng $1');
  const zone = text(contract, 'unit.zone');
  return [floor, zone && (/^khu\b/i.test(zone) ? zone : 'Khu ' + zone)].filter(Boolean).join(' · ');
}

function rentalName(rental: Row) {
  return text(rental, 'storageType.name') || 'Kho của bạn';
}

function RentalList({ items }: { items: Selection[] }) {
  const [search, setSearch] = useState('');
  const records = items.map(({ rental, contract }) => ({
    rental, contract,
    name: text(contract, 'unit.storageType.name') || text(rental, 'storageType.name'),
    unit: text(contract, 'unit.unitCode'),
    code: text(contract, 'contractCode'),
    facility: text(contract, 'unit.storageType.facility.name', 'unit.facility.name') || text(rental, 'facility.name'),
  }));
  const visible = records.filter(item => recordMatches([item.name, item.unit, item.code, item.facility], search));
  return <>
    <View style={styles.listTotal}>
      <View style={[styles.icon, styles.listIcon]}><Warehouse size={26} color={C.cobalt} /></View>
      <View style={styles.listCount}><Text style={styles.listMeta}>Tổng số kho đang thuê</Text>
        <Text style={styles.countValue}>{items.length} kho</Text></View>
    </View>
    <View style={styles.search}>
      <Search size={20} color={C.muted} />
      <TextInput accessibilityLabel="Tìm kho đang thuê" placeholder="Tìm theo loại kho, mã kho, hợp đồng hoặc cơ sở..."
        placeholderTextColor={C.muted} value={search} onChangeText={setSearch} style={styles.searchInput}
        autoCorrect={false} returnKeyType="search" />
    </View>
    <Text accessibilityRole="header" style={styles.sectionTitle}>Danh sách kho đang thuê</Text>
    {!items.length ? <View style={styles.listEmpty}>
      <Warehouse size={30} color={C.cobalt} />
      <Text style={styles.sectionTitle}>Bạn chưa có kho đang thuê</Text>
      <Text style={styles.listMeta}>Các kho bạn thuê sẽ hiển thị tại đây.</Text>
    </View> : !visible.length ? <EmptyState title="Không tìm thấy kho phù hợp" message="Thử tìm theo loại kho, mã kho, hợp đồng hoặc cơ sở khác." />
      : visible.map(({ rental, contract, name, unit, code, facility }) => {
        const start = text(contract, 'startDate'), end = text(contract, 'endDate');
        const dates = [start, end].filter(Boolean).map(value => formatDate(value)).join(' – ');
        const period = start && end ? 'Thời hạn thuê' : start ? 'Bắt đầu thuê' : 'Kết thúc thuê';
        return <Pressable key={idOf(contract)} accessibilityRole="button" style={({pressed}) => [styles.listCard, pressed && styles.pressed]}
          onPress={() => router.push({ pathname: '/customer/[resource]/[id]', params: { resource: 'rentals', id: idOf(rental), rentalContractId: idOf(contract) } })}>
          <View style={styles.grow}>
            <View style={styles.listIdentity}>
              <View style={[styles.icon, styles.listIcon]}><Warehouse size={24} color={C.cobalt} /></View>
              <View style={styles.grow}>
                <Text style={styles.listName}>{name || 'Kho của bạn'}</Text>
                {unit ? <Text style={styles.listMeta}>{unit}</Text> : null}
              </View>
              <Text style={styles.activeListBadge}>Đang hoạt động</Text>
            </View>
            {facility ? <RentalListFact icon={MapPin} value={'Cơ sở: ' + facility} /> : null}
            {code ? <RentalListFact icon={FileText} value={'Hợp đồng: ' + code} /> : null}
            {dates ? <RentalListFact icon={CalendarDays} value={period + ': ' + dates} /> : null}
          </View>
          <ChevronRight size={18} color={C.muted} />
        </Pressable>;
      })}
  </>;
}

function RentalListFact({ icon: Icon, value }: { icon: LucideIcon; value: string }) {
  return <View style={styles.listFact}><Icon size={15} color={C.muted} /><Text style={[styles.listMeta, styles.grow]}>{value}</Text></View>;
}
function RentalDetail({ rental, contract, product, onRefresh }: Selection & { product: Row; onRefresh: () => void }) {
  const [action, setAction] = useState<FormAction>();
  const [notice, setNotice] = useState(false);
  const returns = useResource<Row>('/customer/returns', true);
  const requests = useResource<Row>('/customer/support-requests', true);
  const reservationId = idOf(rental);
  const contractId = idOf(contract);
  const query = 'rentalContractId=' + encodeURIComponent(contractId);
  const sentReturns = rows(returns.data?.items);
  const pendingReturn = sentReturns.find(item => item.status !== 'COMPLETED' && text(item, 'reservation.id') === reservationId &&
    (text(item, 'rentalContractId') === contractId || rows(item.inspections).some(inspection => text(inspection, 'contract.id') === contractId)));
  const returnInProgress = Boolean(pendingReturn || contract.returnInProgress);
  const returnId = pendingReturn ? idOf(pendingReturn) : '';
  const ready = !returns.loading && !requests.loading && !returns.error && !requests.error;
  const authorized = ready && !returnInProgress ? customerRentalActions(rental, sentReturns, currentTimeMs(), rows(requests.data?.items), contractId) : [];
  const renewal = authorized.find(item => item.renewal);
  const unitCode = text(contract, 'unit.unitCode');
  const type = object(object(contract.unit).storageType);
  const facility = object(type.facility ?? rental.facility);
  const closing = facility.operationalStatus === 'CLOSING' || facility.operationalStatus === 'CLOSED';
  const dimensions = [type.widthCm, type.lengthCm, type.heightCm];
  const hasDimensions = dimensions.every(value => typeof value === 'number' && value > 0);
  const measure = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  const sizeLabel = hasDimensions ? dimensions.map(value => measure(Number(value) / 100)).join(' × ') + ' m' : text(product, 'dimensions');
  const areaLabel = hasDimensions ? measure(Number(dimensions[0]) * Number(dimensions[1]) / 10000) + ' m²' : text(product, 'floorArea');
  const pending = contract.pendingRenewal ?? (!('pendingRenewal' in contract) ? rental.pendingRenewal : null);
  const renewalId = text(object(pending), 'id', 'renewalCode');
  const go = (path: string) => () => router.push(path as Href);
  const scope = 'reservationId=' + encodeURIComponent(reservationId) + '&' + query;
  const transfer = rows(requests.data?.items).find(item => isTransferRequest(item) &&
    text(item, 'contract.id', 'rentalContractId') === contractId &&
    (item.status !== 'RESOLVED' || rows(item.transfers).some(entry => ['REQUESTED', 'APPROVED'].includes(text(entry, 'status')))));
  const transferId = transfer ? idOf(transfer) : '';
  const busyCopy = ready ? 'Chưa đủ điều kiện gia hạn' : returns.loading || requests.loading ? 'Đang kiểm tra điều kiện…' : 'Chưa tải được điều kiện';
  const shortcuts = [
    { title: 'Vị trí kho', icon: MapPin, path: '/customer/floor-plan?rentalId=' + encodeURIComponent(reservationId) + '&' + query },
    { title: 'Hợp đồng', icon: FileText, path: '/customer/contracts/' + encodeURIComponent(contractId) },
    { title: 'Hóa đơn', icon: ReceiptText, path: '/customer/invoices?' + scope },
  ];
  const facts: [string, string, LucideIcon][] = [
    ['Mã hợp đồng', text(contract, 'contractCode'), FileText],
    ['Bắt đầu thuê', text(contract, 'startDate') ? formatDate(text(contract, 'startDate')) : '', CalendarDays],
    ['Kết thúc thuê', text(contract, 'endDate') ? formatDate(text(contract, 'endDate')) : '', CalendarDays],
    ['Vị trí trong cơ sở', locationOf(contract), MapPin],
    ['Kích thước', sizeLabel, Box],
    ['Diện tích', areaLabel, Layers],
  ];
  return <>
    <View style={styles.summary}>
      <View style={styles.hero}>
        <View style={[styles.icon, styles.heroIcon]}><Warehouse size={30} color={C.cobalt} /></View>
        <View style={styles.grow}>
          <Text style={styles.heroTitle}>{text(contract, 'unit.storageType.name') || rentalName(rental)}</Text>
          {unitCode ? <Text style={styles.subtitle}>{unitCode}</Text> : null}
        </View>
        {contract.status === 'ACTIVE' ? <View style={styles.activeBadge}><CircleCheck size={14} color="#087935" />
          <Text style={styles.activeText}>Đang thuê</Text></View> : <StatusBadge status={text(contract, 'status')} />}
      </View>
      <View style={styles.facility}>
        <Building2 size={25} color={C.cobalt} />
        <View style={styles.grow}>
          <Text style={styles.rowTitle}>{text(facility, 'name') || 'Cơ sở chưa được cung cấp'}</Text>
          {text(facility, 'address') ? <Text style={styles.subtitle}>{text(facility, 'address')}</Text> : null}
        </View>
      </View>
      <View style={styles.facts}>
        {[0, 2, 4].map(index => <View key={index} style={[styles.factRow, index < 4 && styles.rule]}>
          {facts.slice(index, index + 2).map(([label, value, Icon], column) => <View key={label} style={[styles.fact, column === 0 && styles.factLeft]}>
            <Icon size={17} color={C.cobalt} />
            <View style={styles.grow}>
              <Text style={styles.factLabel}>{label}</Text>
              <Text style={styles.factValue}>{value || 'Chưa có thông tin'}</Text>
            </View>
          </View>)}
        </View>)}
      </View>
    </View>
    {closing && <View style={styles.summary}>
      <Text style={styles.sectionTitle}>Cơ sở đang ngừng kinh doanh</Text>
      <Text style={styles.subtitle}>{facility.closureMode === 'REQUIRED_RELOCATION' ? 'Tạm dừng ra vào thông thường. Nhân viên sẽ liên hệ hỗ trợ di dời an toàn.' : 'Bạn tiếp tục sử dụng kho đến hết hạn thuê. Liên hệ nhân viên nếu cần chuyển cơ sở.'}</Text>
    </View>}
    <CustomerRelocations contractId={contractId} onRefresh={onRefresh} />
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Truy cập nhanh</Text>
      <View style={styles.shortcuts}>{shortcuts.map(({ title, icon: Icon, path }) =>
        <Pressable key={title} accessibilityRole="button" onPress={go(path)} style={({pressed}) => [styles.shortcut, pressed && styles.pressed]}>
          <View style={styles.icon}><Icon size={21} color={C.cobalt} /></View>
          <Text style={styles.rowTitle}>{title}</Text>
        </Pressable>)}</View>
    </View>
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Yêu cầu dịch vụ</Text>
      <RequestRow title="Yêu cầu gia hạn" icon={CalendarPlus}
        subtitle={renewalId ? 'Xem yêu cầu đang xử lý' : renewal ? 'Tiếp tục thời hạn thuê' : busyCopy}
        onPress={renewalId ? go('/customer/renewals/' + encodeURIComponent(renewalId))
          : renewal && !closing ? () => { setNotice(false); setAction(renewal); } : undefined} />
      <RequestRow title="Yêu cầu chuyển kho" icon={ArrowDownUp}
        subtitle={transferId ? 'Xem yêu cầu chuyển kho đang xử lý' : returnInProgress ? 'Đang xử lý trả kho' : 'Cùng cơ sở và cùng loại kho'}
        onPress={transferId ? go('/customer/transfers/' + encodeURIComponent(transferId))
          : ready && !returnInProgress ? go(rentalChangePath('transfers', contractId)) : undefined} />
      <RequestRow title="Yêu cầu trả kho" icon={LogOut}
        subtitle={returnInProgress ? 'Theo dõi yêu cầu trả kho' : 'Trả đúng hạn hoặc trước hạn'}
        onPress={ready ? go(returnInProgress
          ? returnId ? '/customer/returns/' + encodeURIComponent(returnId) : '/customer/returns?tab=sent'
          : '/customer/returns/new?' + scope) : undefined} />
      <RequestRow title="Báo sự cố & hỗ trợ" icon={Headphones} subtitle="Kho, khóa, quyền ra vào hoặc vấn đề khác"
        onPress={go(supportPath + '/new?' + scope)} />
      {returns.error || requests.error ? <ErrorState message="Chưa tải được thông tin yêu cầu." onRetry={() => { returns.refresh(); requests.refresh(); }} /> : null}
      {notice ? <Text accessibilityRole="alert" style={{ color: C.success }}>Đã gửi yêu cầu.</Text> : null}
    </View>
    <CustomerRecordActions actions={[]} selected={action} onSelect={setAction} onClose={() => setAction(undefined)}
      onSaved={result => { if (action?.renewal) openCreatedRenewal(result); setAction(undefined); setNotice(true); returns.refresh(); requests.refresh(); onRefresh(); }} />
  </>;
}

function RequestRow({ title, subtitle, icon: Icon, onPress }: {
  title: string; subtitle: string; icon: LucideIcon; onPress?: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{disabled: !onPress}} disabled={!onPress}
    onPress={onPress} style={({pressed}) => [styles.action, pressed && styles.pressed]}>
    <View style={styles.icon}><Icon size={22} color={C.cobalt} /></View>
    <View style={styles.grow}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>
    {onPress && <ChevronRight size={18} color={C.muted} />}
  </Pressable>;
}

export function CustomerRentals({ initialRentalId }: { initialRentalId?: string }) {
  const { rentalContractId } = useLocalSearchParams<{ rentalContractId?: string }>();
  const rentals = useResource<{ items: Row[] }>(initialRentalId ? null : '/customer/rentals', true, true);
  const detail = useResource<Row>(initialRentalId ? '/customer/rentals/' + encodeURIComponent(initialRentalId) : null, false, true);
  const source = initialRentalId ? detail : rentals;
  const catalog = usePublicCatalog(undefined, Boolean(initialRentalId));
  const rentalRows = initialRentalId ? (detail.data ? [detail.data] : []) : rentals.data?.items ?? [];
  const choices = rentalRows.flatMap(rental => rows(rental.contracts)
    .filter(contract => contract.status === 'ACTIVE' && idOf(contract) && text(contract, 'unit.id'))
    .map(contract => ({ rental, contract })));
  const group = initialRentalId ? choices.filter(({ rental }) => idOf(rental) === initialRentalId ||
    text(rental, 'reservationReference') === initialRentalId) : choices;
  const selection = initialRentalId && (rentalContractId
    ? group.find(({ contract }) => idOf(contract) === rentalContractId)
    : group.length === 1 ? group[0] : undefined);
  const productId = selection && text(selection.contract, 'unit.storageType.id');
  const product = rows(catalog.data?.products).find(item => productId && text(item, 'id') === productId) ?? {};
  const refresh = () => { source.refresh(); if (initialRentalId) catalog.refresh(); };
  const unavailable = Boolean(initialRentalId && (rentalContractId ? !selection : !group.length));
  return <>
    <Stack.Screen options={{ title: selection || rentalContractId ? 'Chi tiết kho' : 'Kho đang thuê',
      headerTitleAlign: 'center', headerTitleStyle: { fontSize: 20, fontWeight: '800', color: C.cobalt },
      headerShown: !selection, headerBackVisible: Boolean(initialRentalId), headerLeft: initialRentalId ? undefined : () => null, headerRight: () => <View style={styles.navButton}><CustomerNotifications /></View> }} />
    {selection && <SafeAreaView edges={['top']} style={styles.nav}>
      <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.navButton}
        onPress={() => router.dismissTo('/customer/rentals')}>
        <ChevronLeft size={25} color={C.navy} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.navTitle}>Chi tiết kho</Text>
      <View style={styles.navButton}><CustomerNotifications /></View>
    </SafeAreaView>}
    <ScrollView style={styles.screen} contentContainerStyle={selection ? styles.detailPage : styles.listPage} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={source.loading && Boolean(source.data)} onRefresh={refresh} />}>
      {source.loading && !source.data ? <LoadingState layout="detail" />
        : source.error ? <ErrorState message={source.error} onRetry={refresh} />
        : selection ? <RentalDetail key={idOf(selection.contract)} {...selection} product={product} onRefresh={source.refresh} />
        : unavailable ? <>
          <EmptyState title="Kho này không còn trong danh sách đang thuê" message="Về danh sách để chọn kho khác." />
          <CustomerActionRow title="Về danh sách kho đang thuê" path="/customer/rentals" />
        </> : <>
          <CustomerRelocations onRefresh={refresh} />
          <RentalList items={group} />
        </>}
    </ScrollView>
  </>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surface },
  grow: { flex: 1, minWidth: 0 },
  pressed: { backgroundColor: C.soft },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#E7F0FC' },
  listPage: { padding: 15, paddingTop: 12, gap: 12 },
  listTotal: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: 13, backgroundColor: '#EAF2FD' },
  listIcon: { width: 44, height: 44 },
  listCount: { flex: 1, borderLeftWidth: 1, borderColor: '#C9DAF1', paddingLeft: 12, gap: 2 },
  countValue: { color: '#0758DC', fontSize: 24, fontWeight: '800' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderColor: '#D9E1EC', borderRadius: 11 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 42, color: C.text, fontSize: 13 },
  listCard: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 12, borderWidth: 1, borderColor: '#DFE5EE', borderRadius: 15, backgroundColor: 'white' },
  listIdentity: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 5 },
  listName: { fontSize: 16, color: C.text, fontWeight: '800' },
  listMeta: { color: '#415167', fontSize: 13, lineHeight: 18 },
  activeListBadge: { color: '#087643', backgroundColor: '#D5F1E3', borderRadius: 15, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4, fontSize: 11, fontWeight: '800' },
  listFact: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 5 },
  listEmpty: { padding: 21, alignItems: 'center', gap: 7, borderWidth: 1, borderColor: '#DFE5EE', borderRadius: 14 },
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 5, backgroundColor: 'white' },
  navButton: { width: 42, height: 42, borderRadius: 22, borderWidth: 1, borderColor: '#DFE5EE', alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, color: C.cobalt, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  detailPage: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 16, gap: 14 },
  summary: { borderRadius: 16, backgroundColor: '#F5F8FD', borderWidth: 1, borderColor: '#E7F0FC', padding: 12, gap: 7 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 2 },
  heroIcon: { width: 51, height: 46, borderRadius: 12 },
  heroTitle: { color: '#101C33', fontSize: 19, fontWeight: '800' },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, backgroundColor: '#D1F0DB', paddingVertical: 5, paddingHorizontal: 8 },
  activeText: { fontWeight: '800', color: '#087935', fontSize: 12 },
  facility: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10, backgroundColor: '#E7F0FC', padding: 9 },
  facts: { gap: 0 },
  factRow: { flexDirection: 'row', paddingVertical: 8 },
  rule: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#CDD8E7' },
  fact: { flex: 1, flexDirection: 'row', gap: 6, paddingLeft: 8 },
  factLeft: { flex: 1.18, borderRightWidth: StyleSheet.hairlineWidth, borderColor: '#CDD8E7', paddingLeft: 0, paddingRight: 5 },
  factLabel: { fontSize: 11, color: '#475569', fontWeight: '600' },
  factValue: { color: '#101C33', fontSize: 13, fontWeight: '800', marginTop: 2 },
  section: { gap: 6 },
  sectionTitle: { color: '#101C33', fontSize: 17, fontWeight: '800' },
  shortcuts: { flexDirection: 'row', gap: 7 },
  shortcut: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 65, borderWidth: 1, borderColor: '#DFE5EE', borderRadius: 12 },
  rowTitle: { color: '#101C33', fontSize: 14, fontWeight: '800' },
  subtitle: { color: '#475569', fontSize: 12, lineHeight: 17 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 49, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: '#DFE5EE', borderRadius: 13 },
});
