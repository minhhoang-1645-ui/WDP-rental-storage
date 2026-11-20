import { useRef, useState, type ReactNode } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type ListRenderItemInfo } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ArrowDownToLine, ArrowUpFromLine, Box, CalendarDays, ChevronDown, ChevronRight, ChevronUp, ClipboardList, Clock3, Info, MapPin, Plus, RefreshCw, Search, Warehouse, X } from 'lucide-react-native';
import { useResource } from '@/operations/use-resource';
import { idOf, text, type Row } from '@/operations/model';
import type { StockMovement, StoredItem } from '@/stock/types';
import { recordMatches } from '@/utils/record-search';
import { formatDate } from '@/utils/format';
import { CustomerStockCreate } from './customer-stock-create';
import { CustomerInfoGrid } from './customer-info-grid';
import { ErrorState, LoadingState } from './screen-state';
import { ItemPhotos } from './item-photos';
import { inventoryBlue, movementStatus, movementWarehouse, warehouseName, warehousePeriod } from './inventory-presentation';

type Tab = 'inventory' | 'movements';
type Group = 'active' | 'history';
type HistoryItem = { item: StoredItem; incoming: number; outgoing: number };
type Entry = { kind: 'item'; item: StoredItem; history?: HistoryItem } | { kind: 'ticket'; ticket: StockMovement };
const filters = [
  { value: '', label: 'Tất cả' },
  { value: 'REQUESTED', label: 'Chờ xử lý' },
  { value: 'ASSIGNED', label: 'Đã tiếp nhận' },
  { value: 'COMPLETED', label: 'Hoàn tất' },
  { value: 'CANCELLED', label: 'Đã hủy' },
] as const;

function Segments({ options, selected, onChange, strong = false }: {
  options: { value: string; label: string }[]; selected: string; onChange: (value: string) => void; strong?: boolean;
}) {
  return <View style={s.segmentTrack}>{options.map(option => {
    const checked = selected === option.value;
    return <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected: checked }}
      onPress={() => onChange(option.value)} style={[s.segment, checked && (strong ? s.segmentBlue : s.segmentWhite)]}>
      <Text style={[s.small, checked && (strong ? s.white : s.blue)]}>{option.label}</Text>
    </Pressable>;
  })}</View>;
}

function InventoryBadge({ title, tone }: { title: string; tone: 'green' | 'blue' | 'amber' | 'gray' }) {
  const colors = { green: ['#DCF5E7', '#14643D'], blue: ['#E0EEFF', '#174FAC'], amber: ['#FFF0CC', '#875208'], gray: ['#E9EDF3', '#475467'] }[tone];
  return <View style={[s.badge, { backgroundColor: colors[0] }]}>
    <Text style={[s.badgeText, { color: colors[1] }]}>{title}</Text>
  </View>;
}

function ArchivedWarehouse({ contract, open, onPress }: { contract: Row; open: boolean; onPress: () => void }) {
  const Chevron = open ? ChevronUp : ChevronDown;
  return <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }}
    onPress={onPress} style={[s.card, s.archiveHeader, open && s.archiveHeaderOpen]}>
    <Warehouse color={inventoryBlue} size={19}/>
    <View style={s.grow}>
      <Text style={s.label}>{warehouseName(contract)}</Text>
      {Boolean(warehousePeriod(contract)) && <Text style={s.small}>{warehousePeriod(contract)}</Text>}
    </View>
    <InventoryBadge tone="gray" title="Đã kết thúc"/>
    <Chevron color={inventoryBlue} size={15}/>
  </Pressable>;
}

function Empty({ title, description }: { title: string; description: string }) {
  return <View style={s.empty}>
    <Box color={inventoryBlue} size={24}/>
    <Text style={s.label}>{title}</Text>
    <Text style={[s.small, s.centerText]}>{description}</Text>
  </View>;
}

function historicalGoods(tickets: StockMovement[]) {
  const entries = new Map<string, HistoryItem>();
  for (const ticket of tickets) {
    if (ticket.status !== 'COMPLETED') continue;
    for (const line of ticket.lines) {
      if (typeof line.actualQty !== 'number' || line.actualQty <= 0) continue;
      const entry = entries.get(line.storedItem.id) ?? { item: line.storedItem, incoming: 0, outgoing: 0 };
      if (ticket.type === 'IN') entry.incoming += line.actualQty;
      else entry.outgoing += line.actualQty;
      entries.set(line.storedItem.id, entry);
    }
  }
  return [...entries.values()];
}

function recordedQuantity(history: HistoryItem) {
  const { incoming, outgoing, item } = history;
  return [incoming ? 'Nhập ' + incoming + ' ' + item.unit : '', outgoing ? 'Xuất ' + outgoing + ' ' + item.unit : ''].filter(Boolean).join(' · ');
}

export function CustomerInventory({ initialTab = 'inventory' }: { initialTab?: Tab }) {
  const params = useLocalSearchParams<{ rentalContractId?: string; tab?: Tab; create?: string; type?: 'IN' | 'OUT' }>();
  const contracts = useResource<{ items: Row[] }>('/customer/contracts', true, true);
  const [group, setGroup] = useState<Group>();
  const [closedArchive, setClosedArchive] = useState('');
  const [sentNotice, setSentNotice] = useState('');
  const all = contracts.data?.items ?? [];
  const activeWarehouses = all.filter(contract => contract.status === 'ACTIVE');
  const history = all.filter(contract => contract.status === 'COMPLETED');
  const linked = all.find(contract => idOf(contract) === params.rentalContractId || text(contract, 'contractCode') === params.rentalContractId);
  const currentGroup = group ?? (linked ? linked.status === 'COMPLETED' ? 'history' : 'active' : activeWarehouses.length ? 'active' : 'history');
  const active = currentGroup === 'active';
  const warehouses = active ? activeWarehouses : history;
  const requested = params.rentalContractId;
  const selected = requested
    ? linked && warehouses.includes(linked) && (active || closedArchive !== idOf(linked)) ? linked : undefined
    : active ? warehouses[0] : undefined;
  const tab: Tab = params.tab === 'movements' || params.tab === 'inventory' ? params.tab : initialTab;

  function choose(contract: Row) {
    setClosedArchive('');
    setSentNotice('');
    router.setParams({ rentalContractId: idOf(contract), create: '', type: '' });
  }

  function selectGroup(value: string) {
    if (value === currentGroup) return;
    setGroup(value === 'active' ? 'active' : 'history');
    setClosedArchive('');
    setSentNotice('');
    router.setParams({ rentalContractId: '', create: '', type: '', tab: 'inventory' });
  }

  const header = <Segments strong selected={currentGroup} onChange={selectGroup}
    options={[{ value: 'active', label: 'Kho đang dùng' }, { value: 'history', label: 'Kho đã dùng' }]}/>;
  const archiveRow = (contract: Row) => <ArchivedWarehouse key={idOf(contract)} contract={contract} open={selected === contract}
    onPress={() => selected === contract ? setClosedArchive(idOf(contract)) : choose(contract)}/>;
  const index = selected ? warehouses.indexOf(selected) : -1;
  const archiveBefore = !active ? warehouses.slice(0, index < 0 ? warehouses.length : index + 1).map(archiveRow) : null;
  const archiveAfter = !active && index >= 0 ? warehouses.slice(index + 1).map(archiveRow) : null;
  const selector = active ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontal}>
    {warehouses.map(contract => <Pressable key={idOf(contract)} accessibilityRole="radio" accessibilityState={{ checked: selected === contract }}
      onPress={() => choose(contract)} style={[s.warehouseChip, selected === contract && s.chipSelected]}>
      <Box size={15} color={selected === contract ? inventoryBlue : '#475467'}/>
      <Text numberOfLines={1} style={[s.small, selected === contract && s.blue]}>{warehouseName(contract)}</Text>
    </Pressable>)}
  </ScrollView> : archiveBefore;

  return <View style={s.screen}>
    <Stack.Screen options={{ title: 'Hàng hóa', headerTitleAlign: 'center', headerTitleStyle: { color: inventoryBlue, fontSize: 18, fontWeight: '700' } }}/>
    {selected ? <InventoryContent key={idOf(selected)} contract={selected} activeWarehouses={activeWarehouses} tab={tab}
      creating={active && params.create === '1'} initialAction={params.type} refreshContracts={contracts.refresh}
      notice={sentNotice === idOf(selected)}
      onCreated={id => { setSentNotice(id); router.setParams({ rentalContractId: id, create: '', type: '', tab: 'movements' }); }}
      before={<>{header}{selector}</>} after={archiveAfter}/> :
      <ScrollView contentContainerStyle={[s.page, s.stack]} refreshControl={<RefreshControl refreshing={contracts.loading} onRefresh={contracts.refresh}/>}>
        {header}
        {contracts.loading ? <LoadingState layout="compact"/> : contracts.error ? <ErrorState message={contracts.error} onRetry={contracts.refresh}/> : <>
          {warehouses.length > 0 && selector}
          {warehouses.length === 0 && <Empty title={active ? 'Chưa có kho đang dùng' : 'Chưa có kho đã dùng'}
            description={active ? 'Kho sẽ xuất hiện sau khi bạn nhận bàn giao.' : 'Kho đã kết thúc kỳ thuê sẽ xuất hiện tại đây.'}/>}
          {Boolean(requested) && !closedArchive && warehouses.length > 0 && <Empty title="Kho được chọn không khả dụng" description="Chọn một kho trong danh sách để xem hàng hóa."/>}
        </>}
      </ScrollView>}
  </View>;
}

function InventoryContent({ contract, activeWarehouses, tab, before, after, refreshContracts, creating, initialAction, notice, onCreated }: {
  contract: Row; activeWarehouses: Row[]; tab: Tab; before: ReactNode; after: ReactNode;
  refreshContracts: () => void; creating: boolean; initialAction?: 'IN' | 'OUT'; notice: boolean; onCreated: (id: string) => void;
}) {
  const active = contract.status === 'ACTIVE';
  const contractId = idOf(contract);
  const warehouse = warehouseName(contract);
  const query = '?rentalContractId=' + encodeURIComponent(contractId);
  const inventory = useResource<StoredItem[]>(active ? '/customer/stored-items' + query : null, false, true);
  const movements = useResource<{ items: StockMovement[] }>('/customer/stock-movements' + query, true, true);
  const [search, setSearch] = useState('');
  const [showRequestSearch, setShowRequestSearch] = useState(false);
  const [status, setStatus] = useState('');
  const [opened, setOpened] = useState<Extract<Entry, { kind: 'item' }>>();
  const busy = useRef(false);
  const tickets = (movements.data?.items ?? []).filter(ticket => ticket.rentalContract.id === contractId);
  const items = (inventory.data ?? []).filter(item => item.balance > 0 && (!item.rentalContract || item.rentalContract.id === contractId));
  const goods: Entry[] = active
    ? items.map(item => ({ kind: 'item', item }))
    : historicalGoods(tickets).map(history => ({ kind: 'item', item: history.item, history }));
  const source: Entry[] = tab === 'inventory' ? goods : tickets.map(ticket => ({ kind: 'ticket', ticket }));
  const resource = active && tab === 'inventory' ? inventory : movements;
  const shown = source.filter(entry => entry.kind === 'item'
    ? recordMatches({ name: entry.item.name, code: entry.item.itemCode }, search)
    : (!status || entry.ticket.status === status) && recordMatches({
      code: entry.ticket.movementCode, names: entry.ticket.lines.map(line => line.storedItem.name),
    }, search));

  function refresh() {
    refreshContracts();
    if (active) inventory.refresh();
    movements.refresh();
  }

  function closeCreate() {
    if (busy.current) return;
    Alert.alert('Đóng phiếu?', 'Thông tin chưa gửi sẽ không được lưu.', [
      { text: 'Tiếp tục nhập', style: 'cancel' },
      { text: 'Đóng', style: 'destructive', onPress: () => router.setParams({ create: '', type: '' }) },
    ]);
  }

  function renderEntry({ item: entry }: ListRenderItemInfo<Entry>) {
    if (entry.kind === 'item') {
      const { item, history } = entry;
      const placement = active ? [item.storageUnit?.zone, item.storageUnit?.floor].filter(Boolean).join(' · ') : '';
      return <Pressable accessibilityRole="button" onPress={() => setOpened(entry)}
        style={[s.item, active ? s.card : s.archiveItem]}>
        {item.photos?.[0] ? <Image source={{ uri: item.photos[0] }} style={s.thumb}/> :
          <View style={[s.thumb, s.placeholder]}><Box size={21} color={inventoryBlue}/></View>}
        <View style={s.grow}>
          <Text style={s.label}>{item.name}</Text>
          <View style={s.metadata}><Box size={12} color="#475467"/><Text style={[s.small, s.grow]}>{history ? recordedQuantity(history) : item.balance + ' ' + item.unit}</Text></View>
          {Boolean(placement) && <View style={s.metadata}><MapPin size={12} color="#475467"/><Text style={[s.small, s.grow]}>{placement}</Text></View>}
          {active && item.updatedAt && <View style={s.metadata}><Clock3 size={12} color="#475467"/><Text style={[s.small, s.grow]}>Cập nhật {formatDate(item.updatedAt)}</Text></View>}
        </View>
        <InventoryBadge title={active ? 'Đang lưu' : 'Đã giao nhận'} tone={active ? 'green' : 'gray'}/>
        <ChevronRight size={15} color="#475467"/>
      </Pressable>;
    }

    const { ticket } = entry;
    const Icon = ticket.type === 'IN' ? ArrowUpFromLine : ArrowDownToLine;
    const statusInfo = movementStatus[ticket.status];
    const location = movementWarehouse(ticket);
    const schedule = ticket.scheduledAt ? 'Dự kiến ' + formatDate(ticket.scheduledAt, true) : 'Gửi ' + formatDate(ticket.createdAt, true);
    return <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/customer/stock-movements/[id]', params: { id: ticket.id, rentalContractId: contractId } })}
      style={[s.item, active ? s.card : s.archiveItem]}>
      <View style={[s.ticketIcon, ticket.type === 'OUT' && s.outbound]}><Icon size={19} color={inventoryBlue}/></View>
      <View style={s.grow}>
        <Text style={s.label}>{ticket.type === 'IN' ? 'Gửi hàng vào kho' : 'Lấy hàng ra khỏi kho'}</Text>
        {Boolean(location) && <View style={s.metadata}><Warehouse size={12} color={inventoryBlue}/><Text style={[s.small, s.grow]}>{location}</Text></View>}
        <View style={s.metadata}><Box size={12} color="#475467"/><Text numberOfLines={2} style={[s.small, s.grow]}>
          {ticket.lines.map(line => {
            const quantity = ticket.status === 'COMPLETED' ? line.actualQty : line.requestedQty;
            return quantity === null ? line.storedItem.name : line.storedItem.name + ' (' + quantity + ' ' + line.storedItem.unit + ')';
          }).join(', ')}
        </Text></View>
        <View style={s.metadata}><CalendarDays size={12} color="#475467"/><Text style={[s.small, s.grow]}>{schedule}</Text></View>
      </View>
      {statusInfo && <InventoryBadge title={statusInfo.label} tone={statusInfo.tone}/>}
      <ChevronRight size={15} color="#475467"/>
    </Pressable>;
  }

  const hasData = source.length > 0;
  const filtered = Boolean(search || tab === 'movements' && status);
  return <>
    <FlatList<Entry> contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={resource.loading} onRefresh={refresh}/>}
      keyExtractor={entry => entry.kind === 'item' ? entry.item.id : entry.ticket.id}
      data={resource.loading || resource.error ? [] : shown}
      renderItem={renderEntry}
      ListHeaderComponent={<>
        <View style={[s.stack, !active && s.archiveTitleStack]}>{before}</View>
        <View style={[s.stack, active ? s.activeControls : s.archiveControls]}>
          {active && <View style={[s.card, s.summary]}>
            <Warehouse size={21} color={inventoryBlue}/>
            <View style={s.grow}>
              <Text style={s.label}>{warehouse}</Text>
              <Text style={s.green}>● Đang hoạt động</Text>
            </View>
            <View style={s.metric}><Box size={13} color="#475467"/><Text style={s.label}>{inventory.data ? items.length : '—'}</Text><Text style={s.small}>mặt hàng</Text></View>
            {movements.data && <View style={s.metric}><ClipboardList size={13} color="#475467"/><Text style={s.label}>{tickets.length}</Text><Text style={s.small}>phiếu</Text></View>}
          </View>}
          <Segments selected={tab} onChange={value => { setSearch(''); setStatus(''); setShowRequestSearch(false); router.setParams({ tab: value }); }}
            options={[{ value: 'inventory', label: active ? 'Hàng đang lưu' : 'Hàng từng lưu' }, { value: 'movements', label: active ? 'Phiếu nhập/xuất' : 'Lịch sử nhập/xuất' }]}/>
          {!active && <View style={s.note}><Info size={14} color="#475467"/><Text style={[s.small, s.grow]}>Dữ liệu của kỳ thuê đã kết thúc, chỉ xem.</Text></View>}
          {active && <View style={s.toolbar}>
            {tab === 'inventory' && hasData && <SearchBox value={search} onChange={setSearch} inventory/>}
            {(tab !== 'inventory' || !hasData) && <Text style={[s.label, s.grow]}>{tab === 'inventory' ? 'Hàng trong kho' : 'Phiếu của bạn'}</Text>}
            {tab === 'movements' && hasData && <Pressable accessibilityRole="button" accessibilityLabel="Tìm phiếu" accessibilityState={{ expanded: showRequestSearch }}
              onPress={() => { setShowRequestSearch(value => !value); setSearch(''); }} style={s.iconButton}><Search color={inventoryBlue} size={17}/></Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel="Tải lại hàng hóa" onPress={refresh} style={s.iconButton}><RefreshCw color={inventoryBlue} size={17}/></Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.setParams({ create: '1', type: '' })} style={s.create}>
              <Plus size={15} color="white"/><Text style={s.createText}>Tạo phiếu</Text>
            </Pressable>
          </View>}
          {hasData && tab === 'movements' && <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontal}>
              {filters.filter(filter => filter.value !== 'CANCELLED' || tickets.some(ticket => ticket.status === 'CANCELLED')).map(filter =>
                <Pressable key={filter.value} accessibilityRole="radio" accessibilityState={{ checked: filter.value === status }}
                  style={[s.filter, filter.value === status && s.segmentBlue, filter.value === 'COMPLETED' && status !== filter.value && s.completeFilter]}
                  onPress={() => setStatus(filter.value)}>
                  <Text style={[s.small, filter.value === status ? s.white : filter.value === 'COMPLETED' ? s.green : undefined]}>{filter.label}</Text>
                </Pressable>)}
            </ScrollView>
            {active && showRequestSearch && <SearchBox value={search} onChange={setSearch}/>}
          </>}
          {notice && tab === 'movements' && <Text accessibilityLiveRegion="polite" style={s.green}>Đã gửi phiếu thành công.</Text>}
          {resource.loading ? <LoadingState layout="compact"/> : resource.error ? <ErrorState message={resource.error} onRetry={refresh}/> : null}
        </View>
      </>}
      ListEmptyComponent={!resource.loading && !resource.error ? <View style={!active && s.archiveBody}>
        <Empty title={filtered ? 'Không có kết quả phù hợp' : tab === 'movements' ? 'Chưa có phiếu nhập/xuất' : active ? 'Kho chưa có hàng đang lưu' : 'Chưa có dữ liệu hàng từng lưu'}
          description={filtered ? 'Thử đổi từ khóa hoặc bộ lọc.' : tab === 'movements' ? active ? 'Tạo phiếu khi bạn cần gửi hoặc lấy hàng.' : 'Kỳ thuê này chưa có phiếu giao nhận.' : active ? 'Hàng hiển thị sau khi nhân viên kiểm đếm.' : 'Chỉ hiển thị hàng có số lượng đã được kiểm đếm trên phiếu hoàn tất.'}/>
      </View> : undefined}
      ListFooterComponent={!active ? <><View style={s.archiveEnd}/><View style={s.stack}>{after}</View></> : undefined}/>
    {creating && <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={closeCreate}>
      <GestureHandlerRootView style={s.screen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.screen}>
          <CustomerStockCreate contract={contract} warehouses={activeWarehouses} initialAction={initialAction}
            onBusyChange={value => { busy.current = value; }} onClose={closeCreate}
            onSaved={id => { setSearch(''); setStatus(''); if (id === contractId) movements.refresh(); onCreated(id); }}/>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>}
    {opened && <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpened(undefined)}>
      <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={[s.page, s.stack]}>
        <View style={s.toolbar}>
          <Text style={[s.label, s.grow]}>{opened.item.name}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng chi tiết hàng" onPress={() => setOpened(undefined)} style={s.iconButton}><X color="#17243A" size={20}/></Pressable>
        </View>
        <ItemPhotos photos={opened.item.photos ?? []}/>
        <CustomerInfoGrid values={[
          [opened.history ? 'Đã giao nhận' : 'Đang lưu', opened.history ? recordedQuantity(opened.history) : opened.item.balance + ' ' + opened.item.unit],
          [active ? 'Kho' : 'Kỳ thuê', active ? warehouse : [warehouse, warehousePeriod(contract)].filter(Boolean).join(' · ')],
          ['Mã hàng', opened.item.itemCode], ['Ghi chú', opened.item.note],
        ]}/>
        {!active && <Text style={s.small}>Xem số lượng từng lần giao nhận trong Lịch sử nhập/xuất.</Text>}
      </ScrollView></SafeAreaView>
    </Modal>}
  </>;
}

function SearchBox({ value, onChange, inventory }: { value: string; onChange: (value: string) => void; inventory?: boolean }) {
  const label = inventory ? 'Tìm tên hàng' : 'Tìm mã phiếu hoặc tên hàng';
  return <View style={s.search}>
    <Search size={16} color="#667085"/>
    <TextInput style={s.input} value={value} onChangeText={onChange} accessibilityLabel={label} placeholder={label + '…'}
      placeholderTextColor="#667085" maxLength={120}/>
  </View>;
}

const border = '#E1E6EF';
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  page: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 18 },
  stack: { gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  centerText: { textAlign: 'center' },
  segmentTrack: { flexDirection: 'row', gap: 3, padding: 2, borderRadius: 13, backgroundColor: '#EFF2F8' },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 36, borderRadius: 11, paddingHorizontal: 4 },
  segmentBlue: { backgroundColor: inventoryBlue, borderColor: inventoryBlue },
  segmentWhite: { backgroundColor: 'white', borderWidth: 1, borderColor: '#DAE7FC' },
  horizontal: { gap: 6, alignItems: 'center' },
  warehouseChip: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 38, maxWidth: 224, paddingHorizontal: 9, backgroundColor: '#F5F7FB', borderWidth: 1, borderColor: border, borderRadius: 11 },
  chipSelected: { backgroundColor: '#F0F5FF', borderColor: inventoryBlue },
  filter: { justifyContent: 'center', minHeight: 36, paddingHorizontal: 11, borderRadius: 18, borderWidth: 1, borderColor: border },
  completeFilter: { backgroundColor: '#E4F6EC', borderColor: '#E4F6EC' },
  blue: { color: inventoryBlue, fontWeight: '700' },
  white: { color: 'white', fontWeight: '700' },
  green: { fontSize: 12, color: '#14643D', fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '700', color: '#17243A' },
  small: { fontSize: 12, lineHeight: 17, color: '#475467' },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: border, borderRadius: 12 },
  summary: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 9 },
  metric: { alignItems: 'center', minWidth: 56, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: border },
  activeControls: { paddingTop: 8, paddingBottom: 6 },
  archiveTitleStack: { gap: 8 },
  archiveHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', padding: 9, gap: 8 },
  archiveHeaderOpen: { borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  archiveControls: { borderColor: border, borderLeftWidth: 1, borderRightWidth: 1, paddingHorizontal: 6, paddingBottom: 5 },
  archiveBody: { borderColor: border, borderLeftWidth: 1, borderRightWidth: 1 },
  archiveEnd: { height: 7, borderWidth: 1, borderTopWidth: 0, borderColor: border, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, marginBottom: 8 },
  archiveItem: { borderColor: border, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: StyleSheet.hairlineWidth },
  badge: { alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 14 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F1F3FA', borderRadius: 8, padding: 7 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  search: { flexDirection: 'row', alignItems: 'center', flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 6, paddingHorizontal: 9, backgroundColor: '#F1F3F9', borderRadius: 10 },
  input: { color: '#17243A', fontSize: 13, flex: 1, minWidth: 0, minHeight: 40 },
  iconButton: { minWidth: 42, minHeight: 42, borderWidth: 1, borderRadius: 10, borderColor: border, alignItems: 'center', justifyContent: 'center' },
  create: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, minHeight: 42, borderRadius: 10, backgroundColor: inventoryBlue },
  createText: { color: 'white', fontSize: 12, fontWeight: '700' },
  item: { flexDirection: 'row', alignItems: 'center', padding: 7, gap: 7, minHeight: 59 },
  thumb: { width: 47, height: 47, borderRadius: 7 },
  placeholder: { backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center' },
  ticketIcon: { width: 37, height: 37, borderRadius: 9, backgroundColor: '#E0EDFF', alignItems: 'center', justifyContent: 'center' },
  outbound: { backgroundColor: '#EFEBFF' },
  metadata: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  empty: { padding: 20, alignItems: 'center', gap: 6 },
});
