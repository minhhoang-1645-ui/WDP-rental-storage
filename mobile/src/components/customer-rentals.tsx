import { rentalChangePath } from '@/components/customer-rental-change';
import { openCreatedRenewal } from '@/components/customer-renewal';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { ArrowDownUp, Boxes, Camera, CalendarDays, ChevronRight, FileText, Headphones, MapPin, RotateCcw, Warehouse } from 'lucide-react-native';
import { usePublicCatalog } from '@/hooks/use-public-catalog';
import { useResource } from '@/operations/use-resource';
import { idOf, rows, text, type Row } from '@/operations/model';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { customerStyles as s, CustomerActionRow } from '@/components/customer-premium';
import { CustomerInfoGrid } from '@/components/customer-info-grid';
import { CustomerRecordActions } from '@/components/customer-record-actions';
import { StatusBadge } from '@/components/customer-ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { customerRentalActions } from '@/portals/actions';
import { supportPath } from '@/components/customer-support';
import type { FormAction } from '@/operations/form';
import { formatDate } from '@/utils/format';

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

function RentalStatus({ rental }: { rental: Row }) {
  return <StatusBadge status={rental.isOverdue || rental.rentalState === 'OVERDUE' ? 'OVERDUE' : 'ACTIVE'} />;
}

function RentalDetail({ rental, contract, product, onRefresh }: Selection & { product: Row; onRefresh: () => void }) {
  const [action, setAction] = useState<FormAction>();
  const [notice, setNotice] = useState(false);
  const returns = useResource<Row>('/customer/returns', true);
  const requests = useResource<Row>('/customer/support-requests', true);
  const reservationId = idOf(rental);
  const contractId = idOf(contract);
  const query = 'rentalContractId=' + encodeURIComponent(contractId);
  const ready = !returns.loading && !requests.loading && !returns.error && !requests.error;
  const authorized = ready ? customerRentalActions(rental, rows(returns.data?.items), Date.now(), rows(requests.data?.items)) : [];
  const renewal = authorized.find(item => item.title === 'Yêu cầu gia hạn');
  const returnAction = authorized.find(item => item.title === 'Yêu cầu trả kho');
  const unitCode = text(contract, 'unit.unitCode');
  const actions = [
    { title: 'Yêu cầu gia hạn', icon: CalendarDays, action: renewal, unavailable: rental.pendingRenewal ? 'Đang có yêu cầu gia hạn' : 'Chưa đủ điều kiện gia hạn' },
    ...(returnAction ? [{ title: 'Yêu cầu trả kho', icon: RotateCcw, action: returnAction, unavailable: '' }] : []),
  ];
  const shortcuts = [
    { title: 'Hàng hóa', icon: Boxes, path: '/customer/stored-items?' + query + '&tab=inventory' },
    { title: 'Vị trí kho', icon: MapPin, path: '/customer/floor-plan?rentalId=' + encodeURIComponent(reservationId) + '&' + query },
  ];
  return <>
    <View style={styles.summary}>
      <View style={styles.titleRow}><Text style={[s.section, styles.grow]}>{rentalName(rental)}</Text><RentalStatus rental={rental} /></View>
      {unitCode ? <Text style={s.secondary}>{unitCode}</Text> : null}
      <CustomerInfoGrid values={[
        ['Kích thước', text(product, 'dimensions')], ['Diện tích', text(product, 'floorArea')],
        ['Vị trí', locationOf(contract)], ['Bắt đầu thuê', formatDate(text(contract, 'startDate'))],
        ['Hạn thuê đến', formatDate(text(contract, 'endDate') || text(rental, 'effectiveEndDate'))],
      ]} />
    </View>
    <View style={styles.shortcuts}>
      {shortcuts.map(({ title, icon: Icon, path }) => <Pressable key={title} accessibilityRole="button"
        style={styles.shortcut} onPress={() => router.push(path as Href)}>
        <View style={styles.icon}><Icon size={20} color={C.navy} /></View>
        <Text style={styles.shortcutLabel}>{title}</Text>
      </Pressable>)}
    </View>
    <View style={styles.management}>
      <Text accessibilityRole="header" style={s.section}>Quản lý kho</Text>
      <CustomerActionRow title="Báo sự cố hàng hóa" icon={Camera} path={'/customer/damage-claims/new?' + query} />
      <CustomerActionRow title="Hợp đồng thuê" icon={FileText} path={'/customer/contracts/' + encodeURIComponent(contractId)} />
      {text(rental, 'pendingRenewal.renewalCode') ? <CustomerActionRow title="Xem gia hạn đang xử lý" icon={CalendarDays}
        path={'/customer/renewals/' + encodeURIComponent(text(rental, 'pendingRenewal.renewalCode'))} /> : null}
      <CustomerActionRow title="Trả kho trước hạn" icon={RotateCcw} path={rentalChangePath('early-returns', contractId)} />
      <CustomerActionRow title="Yêu cầu chuyển kho" icon={ArrowDownUp} path={rentalChangePath('transfers', contractId)} />
      {actions.map(({ title, icon: Icon, action: entry, unavailable }) => <Pressable key={title}
        accessibilityRole="button" accessibilityState={{ disabled: !entry }} disabled={!entry}
        style={styles.action} onPress={() => { setNotice(false); setAction(entry); }}>
        <View style={styles.icon}><Icon size={18} color={C.navy} /></View>
        <View style={styles.grow}><Text style={s.body}>{title}</Text>
          {!entry ? <Text style={s.secondary}>{ready ? unavailable : returns.loading || requests.loading ? 'Đang kiểm tra điều kiện…' : 'Chưa tải được điều kiện'}</Text> : null}
        </View>
        {entry ? <ChevronRight size={17} color={C.muted} /> : null}
      </Pressable>)}
      <CustomerActionRow title="Cần hỗ trợ về kho này?" icon={Headphones} path={supportPath + '/new?reservationId=' + encodeURIComponent(reservationId) + '&' + query} />
      {returns.error || requests.error ? <ErrorState message="Chưa tải được thông tin yêu cầu." onRetry={() => { returns.refresh(); requests.refresh(); }} /> : null}
      {notice ? <Text accessibilityRole="alert" style={{ color: C.success }}>Đã gửi yêu cầu.</Text> : null}
    </View>
    <CustomerRecordActions actions={[]} selected={action} onSelect={setAction} onClose={() => setAction(undefined)}
      onSaved={result => { if (action?.renewal) openCreatedRenewal(result); setAction(undefined); setNotice(true); returns.refresh(); requests.refresh(); onRefresh(); }} />
  </>;
}

export function CustomerRentals({ initialRentalId }: { initialRentalId?: string }) {
  const { rentalContractId } = useLocalSearchParams<{ rentalContractId?: string }>();
  const rentals = useResource<{ items: Row[] }>('/customer/rentals', true, true);
  const catalog = usePublicCatalog();
  const choices = (rentals.data?.items ?? []).flatMap(rental => rows(rental.contracts)
    .filter(contract => contract.status === 'ACTIVE' && idOf(contract) && text(contract, 'unit.id'))
    .map(contract => ({ rental, contract })));
  const group = initialRentalId ? choices.filter(({ rental }) => idOf(rental) === initialRentalId ||
    text(rental, 'reservationReference') === initialRentalId) : choices;
  const selection = initialRentalId && (rentalContractId
    ? group.find(({ contract }) => idOf(contract) === rentalContractId)
    : group.length === 1 ? group[0] : undefined);
  const findProduct = (rental: Row) => rows(catalog.data?.products)
    .find(item => text(item, 'id') === text(rental, 'storageType.id')) ?? {};
  const refresh = () => { rentals.refresh(); catalog.refresh(); };
  const unavailable = Boolean(initialRentalId && (rentalContractId ? !selection : !group.length));
  return <>
    <Stack.Screen options={{ title: selection || rentalContractId ? 'Chi tiết kho' : 'Kho thuê',
      headerTitleAlign: 'center', headerTitleStyle: { fontSize: 20, fontWeight: '700', color: C.navy },
      headerBackVisible: Boolean(initialRentalId) }} />
    <ScrollView style={styles.screen} contentContainerStyle={s.page} contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={rentals.loading && Boolean(rentals.data)} onRefresh={refresh} />}>
      {rentals.loading && !rentals.data ? <LoadingState layout="detail" />
        : rentals.error ? <ErrorState message={rentals.error} onRetry={refresh} />
        : selection ? <RentalDetail key={idOf(selection.contract)} {...selection} product={findProduct(selection.rental)} onRefresh={rentals.refresh} />
        : unavailable ? <>
          <EmptyState title="Kho này không còn trong danh sách đang thuê" message="Về danh sách để chọn kho khác." />
          <CustomerActionRow title="Về Kho thuê" path="/customer/rentals" />
        </> : group.length ? <>
          <View style={styles.titleRow}><Text accessibilityRole="header" style={[s.section, styles.grow]}>Kho đang thuê</Text><Text style={s.secondary}>{group.length} kho</Text></View>
          {group.map(({ rental, contract }) => {
            const dimensions = text(findProduct(rental), 'dimensions', 'floorArea');
            const metadata = [text(rental, 'facility.name'), locationOf(contract), dimensions].filter(Boolean).join(' · ');
            return <Pressable key={idOf(contract)} accessibilityRole="button"
              onPress={() => router.push(('/customer/rentals/' + encodeURIComponent(idOf(rental)) + '?rentalContractId=' + encodeURIComponent(idOf(contract))) as Href)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <View style={styles.icon}><Warehouse size={20} color={C.navy} /></View>
              <View style={styles.grow}>
                <View style={styles.titleRow}><Text style={[s.section, styles.grow]}>{rentalName(rental)}</Text><RentalStatus rental={rental} /></View>
                {text(contract, 'unit.unitCode') ? <Text style={s.secondary}>{text(contract, 'unit.unitCode')}</Text> : null}
                {metadata ? <Text style={s.secondary}>{metadata}</Text> : null}
                <Text style={styles.endDate}>Hạn thuê {formatDate(text(contract, 'endDate') || text(rental, 'effectiveEndDate'))}</Text>
              </View>
              <ChevronRight size={17} color={C.muted} />
            </Pressable>;
          })}
        </> : <>
          <EmptyState title="Bạn chưa có kho đang thuê" message="Kho sẽ xuất hiện sau khi hoàn tất bàn giao." />
          <CustomerActionRow title="Tìm kho" path="/customer/discover" />
          <CustomerActionRow title="Hàng hóa đã lưu trước đây" path="/customer/stored-items" />
        </>}
    </ScrollView>
  </>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surface },
  grow: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: C.divider, borderRadius: 14 },
  pressed: { backgroundColor: C.soft },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: C.tealSubtle },
  endDate: { color: C.text, fontSize: 13, fontWeight: '600', marginTop: 4 },
  summary: { borderRadius: 16, padding: 14, backgroundColor: '#F1F5FD', gap: 8 },
  shortcuts: { flexDirection: 'row', gap: 8 },
  shortcut: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 64 },
  shortcutLabel: { color: C.text, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  management: { gap: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
});
