import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { router, type Href } from 'expo-router';
import { CalendarDays, ClipboardList, CreditCard, Warehouse, ArrowRight } from 'lucide-react-native';
import { WdpColors } from '@/constants/wdp-theme';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { useResource } from '@/operations/use-resource';
import { Navigation, Panel, styles } from '@/operations/ui';
import { codeOf, label, type Row } from '@/operations/model';

export default function CustomerHomeScreen() {
  const { user } = useAuth();
  const rentals = useResource<{items: Row[]; total: number}>('/customer/rentals', true);
  const invoices = useResource<{items: Row[]}>('/customer/invoices', true);
  const reservations = useResource<Row[]>('/reservations');
  const appointments = useResource<{items: Row[]}>('/customer/appointments', true);
  const sources = [rentals, invoices, reservations, appointments], refresh = () => sources.forEach(item => item.refresh());
  const payable = invoices.data?.items.filter(item => ['OPEN', 'PARTIALLY_PAID'].includes(String(item.status)) && Number(item.balanceDue) > 0) ?? [];
  const count = (source: {loading: boolean; error?: string}, value: number) => source.loading || source.error ? '—' : value;
  const opening = sources.some(item => item.loading) && !rentals.data && !invoices.data && !reservations.data && !appointments.data;

  const shortcuts = [
    { title: 'Đơn đặt kho', path: '/customer/reservations', icon: ClipboardList, count: count(reservations, reservations.data?.filter(item => item.status === 'PENDING').length ?? 0) },
    { title: 'Thanh toán', path: '/customer/invoices', icon: CreditCard, count: count(invoices, payable.length) },
    { title: 'Lịch nhận kho', path: '/customer/appointments', icon: CalendarDays, count: count(appointments, appointments.data?.items.filter(item => ['REQUESTED', 'CONFIRMED'].includes(String(item.status))).length ?? 0) },
    { title: 'Kho đang thuê', path: '/customer/rentals', icon: Warehouse, count: count(rentals, rentals.data?.total ?? 0) },
  ];
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={!opening && sources.some(item => item.loading)} onRefresh={refresh} tintColor={WdpColors.navy} />} contentContainerStyle={styles.page}>
    <View style={{ gap: 4, paddingTop: 8 }}><Text style={styles.copy}>NestBox</Text><Text accessibilityRole="header" style={{ color: WdpColors.navy, fontSize: 28, lineHeight: 36, fontWeight: '700' }}>Chào {user?.fullName ?? 'bạn'}</Text></View>
    <Pressable accessibilityRole="button" onPress={() => router.push('/customer/discover')} style={({ pressed }) => ({ backgroundColor: WdpColors.navy, padding: 24, borderRadius: 16, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', gap: 16, opacity: pressed ? 0.8 : 1 })}>
      <Warehouse size={28} color={WdpColors.surface} /><View style={{ flex: 1, gap: 4 }}><Text style={[styles.title, { color: WdpColors.surface }]}>Tìm kho phù hợp</Text><Text style={[styles.copy, { color: WdpColors.tealSubtle }]}>Chọn kho & đặt thuê</Text></View><ArrowRight size={22} color={WdpColors.surface} />
    </Pressable>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{shortcuts.map(({ title, path, icon: Icon, count: value }) => <Pressable key={path} accessibilityRole="button" accessibilityLabel={title + ', ' + value + ' hồ sơ'} onPress={() => router.push(path as Href)} style={({ pressed }) => [styles.card, { flexBasis: '45%', flexGrow: 1, gap: 16 }, pressed && styles.pressed]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 }}><Icon size={24} color={WdpColors.navy} />{value !== 0 && <Text style={[styles.label, { color: WdpColors.navy, backgroundColor: WdpColors.soft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }]}>{value}</Text>}</View><Text style={styles.title}>{title}</Text>
    </Pressable>)}</View>
    {sources.filter(item => item.error).map((item, index) => <ErrorState key={index} message={item.error!} onRetry={item.refresh} />)}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}><Text accessibilityRole="header" style={styles.title}>Đơn gần đây</Text><Pressable accessibilityRole="button" onPress={() => router.push('/customer/reservations')} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}><Text style={[styles.copy, { color: WdpColors.navy }]}>Xem tất cả</Text></Pressable></View>
    {reservations.loading ? <LoadingState /> : !reservations.error && (reservations.data?.length ? [...reservations.data].sort((a,b) => Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt))).slice(0,2).map(item => <Navigation key={String(item.id)} title={String((item.product as Row)?.name ?? 'Đơn đặt kho')} description={codeOf(item) + ' · ' + label(item.status)} path={'/customer/reservations/' + encodeURIComponent(String(item.id))} />) : <Panel><Text style={styles.copy}>Bạn chưa có đơn đặt kho.</Text></Panel>)}
    <Navigation title="Tất cả dịch vụ" path="/customer/services" />
  </ScrollView>;
}
