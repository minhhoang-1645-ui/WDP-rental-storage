import { openCreatedRenewal } from '@/components/customer-renewal';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeftRight, Box, CalendarDays, Check, ChevronRight, ClipboardList, FileText, Headphones, RefreshCw, Search, TriangleAlert, UserRound, Wallet, Warehouse, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAuth } from '@/auth/use-auth';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { CustomerRecordActions } from '@/components/customer-record-actions';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { useResource } from '@/operations/use-resource';
import { idOf, rows, text, type Row } from '@/operations/model';
import { Button } from '@/operations/ui';
import type { FormAction } from '@/operations/form';
import { customerRentalActions } from '@/portals/actions';
import { recordMatches } from '@/utils/record-search';

type Service = { title: string; icon: LucideIcon; path: string; hint: string; purple?: boolean };
const shortcuts: Service[] = [
  { title: 'Gia hạn', icon: RefreshCw, path: 'renewals', hint: 'Gia hạn thời gian thuê kho' },
  { title: 'Trả kho', icon: Box, path: 'returns', hint: 'Gửi yêu cầu trả kho hoặc đề nghị trả trước hạn' },
  { title: 'Chuyển kho', icon: ArrowLeftRight, path: 'transfers', hint: 'Đổi ô kho đang thuê' },
  { title: 'Báo sự cố', icon: TriangleAlert, path: 'damage-claims', hint: 'Báo cáo sự cố hàng hóa bị hư hỏng' },
];
const groups: { title: string; items: Service[] }[] = [
  { title: 'Hồ sơ & lịch hẹn', items: [
    { title: 'Đơn đặt kho', icon: ClipboardList, path: 'reservations', hint: 'Yêu cầu đặt kho' },
    { title: 'Lịch nhận kho', icon: CalendarDays, path: 'appointments', hint: 'Lịch hẹn bàn giao' },
    { title: 'Hợp đồng', icon: FileText, path: 'contracts', hint: 'Hợp đồng thuê', purple: true },
  ] },
  { title: 'Tài chính & hỗ trợ', items: [
    { title: 'Tiền cọc', icon: Wallet, path: 'deposit-settlements', hint: 'Quyết toán hoàn cọc', purple: true },
    { title: 'Hỗ trợ khách hàng', icon: Headphones, path: 'support-requests', hint: 'Gửi yêu cầu, hóa đơn, thanh toán' },
  ] },
];
const go = (path: string) => router.push(('/customer/' + path) as Href);

export default function CustomerServicesScreen() {
  const { user, logout } = useAuth();
  const { rentalContractId } = useLocalSearchParams<{ rentalContractId?: string }>();
  const [search, setSearch] = useState('');
  const [service, setService] = useState<Service>();
  const [chosen, setChosen] = useState('');
  const [action, setAction] = useState<FormAction>();
  const [notice, setNotice] = useState(false);
  const rentals = useResource<Row>('/customer/rentals', true, true);
  const returns = useResource<Row>('/customer/returns', true, true);
  const requests = useResource<Row>('/customer/support-requests', true, true);
  const sources = service?.path === 'damage-claims' ? [rentals] : [rentals, returns, requests];
  const issue = sources.find(item => item.error);
  const loading = sources.some(item => item.loading);
  const choices = !service || loading || issue ? [] : rows(rentals.data?.items).flatMap(rental => {
    const active = rows(rental.contracts).filter(contract => contract.status === 'ACTIVE' && idOf(contract) && text(contract, 'unit.id'));
    return active.flatMap(contract => {
      const form = customerRentalActions(rental, rows(returns.data?.items), Date.now(), rows(requests.data?.items), idOf(contract))
        .find(item => item.renewal);
      return form || service.path === 'damage-claims' ? [{
        id: idOf(contract), ids: [idOf(contract)], form, title: text(rental, 'storageType.name') || 'Kho đang thuê',
        caption: text(contract, 'unit.unitCode'),
        overdue: Boolean(rental.isOverdue || rental.rentalState === 'OVERDUE'),
      }] : [];
    });
  });
  const selected = choices.find(item => item.id === chosen) ?? choices.find(item => rentalContractId && item.ids.includes(rentalContractId)) ?? (choices.length === 1 ? choices[0] : undefined);
  const results = [...shortcuts, ...groups.flatMap(group => group.items)].filter(item => recordMatches([item.title, item.hint], search));
  const start = (item: Service) => {
    if (item.path === 'transfers' || item.path === 'returns') go(item.path);
    else if (shortcuts.includes(item)) { setService(item); setChosen(''); setNotice(false); }
    else go(item.path);
  };
  function serviceRow(item: Service, showHint = false) {
    const Icon = item.icon;
    return <Pressable key={item.title} accessibilityRole="button" style={s.row} onPress={() => start(item)}>
      <View style={[s.solid, item.purple && s.purple]}><Icon size={20} color="white" /></View>
      <View style={s.grow}><Text style={s.label}>{item.title}</Text>{showHint ? <Text style={s.muted}>{item.hint}</Text> : null}</View><ChevronRight size={17} color={C.muted} />
    </Pressable>;
  }
  return <View style={s.screen}>
    <Stack.Screen options={{ title: 'Dịch vụ', headerBackVisible: false, headerTitleAlign: 'center', headerTitleStyle: { color: C.cobalt, fontSize: 19, fontWeight: '700' } }} />
    <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
      {!search.trim() ? <Pressable accessibilityRole="button" style={s.row} onPress={() => go('account')}>
        <View style={s.solid}><UserRound size={21} color="white" /></View><View style={s.grow}>
          <Text style={s.label}>{user?.fullName || 'Tài khoản của tôi'}</Text><Text style={s.muted}>Thông tin tài khoản và liên hệ</Text>
        </View><ChevronRight size={17} color={C.muted} /></Pressable> : null}
      <View style={s.search}><Search size={19} color={C.muted} /><TextInput accessibilityLabel="Tìm dịch vụ" style={[s.grow, s.field]} placeholder="Tìm dịch vụ..." placeholderTextColor={C.muted} value={search} onChangeText={setSearch} maxLength={80} />
        {search ? <Pressable accessibilityRole="button" accessibilityLabel="Xóa tìm kiếm" hitSlop={9} onPress={() => setSearch('')}><X size={18} color={C.muted} /></Pressable> : null}</View>
      {search.trim() ? <>
        <Text style={s.heading}>Kết quả ({results.length})</Text>
        {results.length ? results.map(item => serviceRow(item, true)) : <Text style={s.muted}>Không tìm thấy dịch vụ phù hợp.</Text>}
        <Text style={s.heading}>Tìm kiếm phổ biến</Text>
        <View style={s.popular}>{shortcuts.slice(0, 3).map(item => <Pressable accessibilityRole="button" key={item.path} style={[s.outline, s.popularChip]} onPress={() => setSearch(item.title)}><Text style={s.label}>{item.title}</Text></Pressable>)}</View>
      </> : <>
        <Text style={s.heading}>Thao tác thường dùng</Text>
        <View style={s.shortcuts}>{shortcuts.map(({ icon: Icon, ...item }, index) =>
          <Pressable key={item.path} accessibilityRole="button" style={s.shortcut} onPress={() => start(shortcuts[index])}>
            <View style={s.soft}><Icon size={24} color={C.cobalt} /></View><Text style={s.shortLabel}>{item.title}</Text>
          </Pressable>)}</View>
        {groups.map(group => <View key={group.title}><Text style={s.heading}>{group.title}</Text>{group.items.map(item => serviceRow(item))}</View>)}
      </>}
      {notice ? <Text accessibilityRole="alert" style={{ color: C.success }}>Đã gửi yêu cầu.</Text> : null}
      <Button title="Đăng xuất" variant="secondary" onPress={async () => { await logout(); router.replace('/login'); }} />
    </ScrollView>
    <Modal visible={Boolean(service)} transparent animationType="slide" onRequestClose={() => setService(undefined)}>
      <SafeAreaView edges={['bottom']} style={s.overlay}><View style={s.sheet}><View style={s.handle} />
        <Text style={s.title}>{service ? 'Chọn kho · ' + service.title : ''}</Text>
        {loading ? <LoadingState layout="compact" /> : issue ? <ErrorState message={issue.error ?? ''} onRetry={issue.refresh} />
          : choices.length ? <ScrollView style={s.sheetList}>
            {choices.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: selected?.id === item.id }} style={s.row} onPress={() => setChosen(item.id)}>
              <View style={s.softSmall}><Warehouse size={19} color={C.cobalt} /></View>
              <View style={s.grow}><Text style={s.label}>{item.title}</Text><Text style={s.muted}>{[item.caption, item.overdue ? 'Quá hạn' : 'Đang hoạt động'].filter(Boolean).join(' · ')}</Text></View>
              {selected?.id === item.id ? <Check size={19} color={C.cobalt} /> : null}
            </Pressable>)}</ScrollView>
          : <Text style={s.muted}>Hiện chưa có kho đủ điều kiện cho thao tác này. Bạn có thể xem các yêu cầu đã gửi.</Text>}
        <View style={s.shortcuts}>
          <Pressable accessibilityRole="button" style={[s.outline, s.flexButton]} onPress={() => setService(undefined)}><Text style={s.heading}>Hủy</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={loading || Boolean(issue) || (choices.length > 0 && !selected)} style={[s.solid, s.flexButton, (loading || issue || (choices.length > 0 && !selected)) && s.disabled]} onPress={() => {
            const path = service?.path;
            setService(undefined);
            if (!path) return;
            if (!selected) go(path);
            else if (path === 'damage-claims') go(path + '/new?rentalContractId=' + encodeURIComponent(selected.id));
            else setAction(selected.form);
          }}><Text style={s.white}>{choices.length ? 'Tiếp tục' : 'Xem yêu cầu'}</Text></Pressable>
        </View>
        {service && choices.length > 0 ? <Pressable accessibilityRole="button" style={s.historyLink} onPress={() => { setService(undefined); go(service.path); }}>
          <Text style={s.heading}>Xem yêu cầu đã gửi</Text>
        </Pressable> : null}
      </View></SafeAreaView>
    </Modal>
    <CustomerRecordActions actions={[]} selected={action} onSelect={setAction} onClose={() => setAction(undefined)}
      onSaved={result => { if (action?.renewal) openCreatedRenewal(result); setAction(undefined); setNotice(true); [rentals, returns, requests].forEach(item => item.refresh()); }} />
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 54, gap: 10, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E1E7F0' },
  grow: { flex: 1, minWidth: 0 },
  heading: { color: C.cobalt, fontWeight: '700', fontSize: 16 },
  title: { color: C.text, fontWeight: '800', fontSize: 20 },
  label: { color: C.text, fontWeight: '600', fontSize: 15 },
  muted: { color: C.muted, fontSize: 13, lineHeight: 18 },
  white: { color: 'white', fontWeight: '700', fontSize: 15 },
  search: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#CCD6E5', borderRadius: 10 },
  field: { minHeight: 44, color: C.text, fontSize: 15 },
  shortcuts: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  shortcut: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6 },
  shortLabel: { color: C.text, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  solid: { width: 39, height: 39, borderRadius: 10, backgroundColor: C.cobalt, alignItems: 'center', justifyContent: 'center' },
  soft: { width: '100%', maxWidth: 67, height: 48, borderRadius: 12, backgroundColor: '#EBF2FE', alignItems: 'center', justifyContent: 'center' },
  softSmall: { width: 34, height: 34, borderRadius: 9, backgroundColor: '#EBF2FE', alignItems: 'center', justifyContent: 'center' },
  purple: { backgroundColor: '#6840C6' },
  popular: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  popularChip: { paddingHorizontal: 10, minHeight: 40 },
  outline: { borderColor: '#B4C8E8', borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#10182880' },
  sheet: { maxHeight: '75%', padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: 'white', gap: 12 },
  sheetList: { flexGrow: 0 },
  handle: { alignSelf: 'center', width: 38, height: 4, backgroundColor: '#C4CCDA', borderRadius: 2 },
  flexButton: { flex: 1, minHeight: 44 },
  disabled: { opacity: 0.5 },
  historyLink: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
