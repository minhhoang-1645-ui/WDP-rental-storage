import { useAuth } from '@/auth/use-auth';
import { invoiceBadge, invoiceTitle, outstanding } from '@/components/customer-invoice-list';
import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, type Href } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Building2, CalendarDays, Check, ChevronRight, ClipboardList, CreditCard, FileText, Headphones, MapPin, Search, Tag, Warehouse, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { CustomerHero } from '@/components/customer-premium';
import { CustomerNotifications } from '@/components/customer-notifications';
import { StatusBadge } from '@/components/customer-ui';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { useResource } from '@/operations/use-resource';
import { idOf, rows, text, object, type Row } from '@/operations/model';
import { formatDate, formatMoney } from '@/utils/format';
import { vietnamCalendarDate } from '@/utils/calendar-date';
import { invoicePaymentBlockedBySchedule, paymentWindowClosed } from '@/utils/payment-state';
import { customerAppointmentAction } from '@/portals/actions';
import { customerAppointmentBookingPath } from '@/utils/handover';
import { bookingStatusText } from '@/utils/customer-booking-display';

type Task = { key: string; title: string; context: string; date: string; rank: number; path: string; icon: LucideIcon };
const shortcuts = [
  { title: 'Đơn đặt kho', path: '/customer/reservations', icon: ClipboardList },
  { title: 'Lịch nhận kho', path: '/customer/appointments', icon: CalendarDays },
  { title: 'Hợp đồng', path: '/customer/contracts', icon: FileText },
  { title: 'Hỗ trợ', path: '/customer/support-requests', icon: Headphones },
];
const go = (path: string) => router.push(path as Href);
const unique = (items: Row[]) => [...new Map(items.filter(item => idOf(item)).map(item => [idOf(item), item])).values()];
const storageName = (row: Row) => text(row, 'reservation.storageType.name', 'reservation.product.name', 'storageType.name', 'product.name');
const facilityName = (row: Row) => text(row, 'reservation.facility.name', 'facility.name');
const reservationId = (row: Row) => text(row, 'reservation.id');
const closedBooking = (row: Row) => ['EXPIRED', 'CANCELLED', 'REJECTED'].includes(text(row, 'reservation.status'));

function taskList(contracts: Row[], invoices: Row[], appointments: Row[], submissions: Row[], onlinePaymentAvailable: boolean, now: number) {
  const today = vietnamCalendarDate(now);
  const initialByReservation = new Map(invoices.filter(row => row.type === 'INITIAL' && row.status !== 'VOID').map(row => [reservationId(row), row]));
  const pending = new Set(submissions.filter(row => row.status === 'PENDING_VERIFICATION').map(row => text(row, 'invoice.id')));
  const tasks: Task[] = [];
  const signTasks = new Map<string, Task[]>();
  const considered = new Set<string>();
  for (const contract of contracts) {
    const id = reservationId(contract);
    const initial = initialByReservation.get(id);
    if (closedBooking(contract) || (initial && Number(initial.balanceDue) > 0 && paymentWindowClosed(initial, now))) continue;
    if (['PENDING_PAYMENT', 'READY_FOR_HANDOVER'].includes(String(contract.status)) && text(contract, 'terms.snapshotHash') && !text(contract, 'terms.acceptedAt')) {
      const key = id || idOf(contract);
      const group = signTasks.get(key) ?? [];
      group.push({ key: 'sign:' + idOf(contract), title: 'Ký hợp đồng thuê kho', context: storageName(contract),
        date: initial ? text(initial, 'reservation.expiresAt', 'dueAt') : '', rank: 0,
        path: '/customer/contract-document?id=' + encodeURIComponent(idOf(contract)), icon: FileText });
      signTasks.set(key, group);
    }
    if (!id || considered.has(id)) continue;
    considered.add(id);
    const group = contracts.filter(item => reservationId(item) === id);
    if (initial?.status === 'PAID' && initial.balanceDue === 0 && group.every(item => Boolean(text(item, 'terms.acceptedAt'))) &&
      !appointments.some(item => reservationId(item) === id && item.status === 'COMPLETED') &&
      customerAppointmentAction(contract, contracts, appointments, now)) {
      tasks.push({ key: 'visit:' + id, title: 'Đặt lịch nhận kho', context: storageName(contract), date: text(contract, 'startDate'), rank: 2,
        path: customerAppointmentBookingPath(id), icon: CalendarDays });
    }
  }
  for (const [key, group] of signTasks) {
    const task = group[0];
    tasks.push(group.length === 1 ? task : { ...task, key: 'sign:' + key, title: `Ký ${group.length} hợp đồng`,
      path: '/customer/contracts?reservationId=' + encodeURIComponent(key) });
  }
  for (const invoice of invoices) {
    const due = text(invoice, 'dueAt');
    const activatesRenewal = invoice.type === 'RENEWAL' && Number(invoice.renewalCycle) === 1 &&
      text(invoice, 'renewalRequest.status') === 'APPROVED_PENDING_PAYMENT';
    const dueNow = invoice.type === 'INITIAL' || activatesRenewal || Boolean(due && due.slice(0, 10) <= today);
    if (!onlinePaymentAvailable || !dueNow || closedBooking(invoice) || !['INITIAL', 'RECURRING', 'RENEWAL'].includes(String(invoice.type)) ||
      !['OPEN', 'PARTIALLY_PAID'].includes(String(invoice.status)) || !(Number(invoice.balanceDue) > 0) ||
      pending.has(idOf(invoice)) || invoicePaymentBlockedBySchedule(invoice, now) || paymentWindowClosed(invoice, now) ||
      (invoice.type === 'RECURRING' ? object(invoice.signing).complete === false : object(invoice.signing).complete !== true)) continue;
    tasks.push({
      key: 'pay:' + idOf(invoice),
      title: (invoice.type === 'RENEWAL' ? 'Thanh toán gia hạn ' : 'Thanh toán ') + formatMoney(Number(invoice.balanceDue)),
      context: storageName(invoice), date: due, rank: 1,
      path: '/customer/invoices/' + encodeURIComponent(idOf(invoice)) + (activatesRenewal ? '?renewalPayment=1' : ''),
      icon: CreditCard,
    });
  }
  const deadline = (task: Task) => {
    const due = Date.parse(task.date) || Infinity;
    return task.path.endsWith('?renewalPayment=1') ? Math.min(due, now) : due;
  };
  return tasks.sort((a, b) => Number(deadline(a) > now) - Number(deadline(b) > now) || a.rank - b.rank || deadline(a) - deadline(b));
}

function SmallIcon({ icon: Icon, warm = false }: { icon: LucideIcon; warm?: boolean }) {
  return <View style={[s.icon, warm && s.warmIcon]}><Icon size={20} color={warm ? C.amber : C.navy} /></View>;
}

function TaskRow({ task, onPress }: { task: Task; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={s.taskRow}>
    <SmallIcon icon={task.icon} warm />
    <View style={s.grow}><Text style={s.heading}>{task.title}</Text>
      {task.context || task.date ? <Text style={s.secondary}>{[task.context, task.date && (task.rank === 2 ? 'Bắt đầu ' : 'Hạn ') + formatDate(task.date)].filter(Boolean).join(' · ')}</Text> : null}
    </View><ChevronRight size={17} color={C.muted} />
  </Pressable>;
}

export default function CustomerHomeScreen() {
  const { user } = useAuth();
  const { top } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [cardIndex, setCardIndex] = useState(0);
  const [showTasks, setShowTasks] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const rentals = useResource<Row>('/customer/rentals', true, true);
  const contracts = useResource<Row>('/customer/contracts', true);
  const invoices = useResource<Row>('/customer/invoices', true);
  const appointments = useResource<Row>('/customer/appointments', true);
  const submissions = useResource<Row>('/customer/payment-submissions', true);
  const config = useResource<Row>('/customer/payment-config');
  const reservations = useResource<Row[]>('/reservations');
  const taskSources = [contracts, invoices, appointments, submissions, config];
  const taskError = taskSources.find(source => source.error);
  const taskLoading = taskSources.some(source => source.loading);
  const sources = [rentals, ...taskSources, reservations];
  const [refreshing, setRefreshing] = useState(false);
  const loading = sources.some(source => source.loading);
  const today = vietnamCalendarDate(now);
  const active = [...new Map(rows(rentals.data?.items).flatMap(rental => rows(rental.contracts)
    .filter(contract => {
      const start = text(contract, 'startDate').slice(0, 10);
      const end = text(contract, 'endDate').slice(0, 10);
      return contract.status === 'ACTIVE' && idOf(contract) && idOf(rental) && text(contract, 'unit.id') &&
        start && start <= today && end && end > today;
    }).map(contract => [idOf(contract), { rental, contract }] as const))).values()];
  const count = active.length;
  const current = Math.min(cardIndex, Math.max(count - 1, 0));
  const availableWidth = Math.min(width, 540);
  const cardWidth = count > 1 ? Math.round(availableWidth * 0.82) : availableWidth - 40;
  const stride = cardWidth + 10;
  const gateway = config.data?.payosConfigured === true ? 'payOS'
    : config.data?.vnpayConfigured === true ? 'VNPay' : '';
  const tasks = !taskError && !taskLoading ? taskList(unique(rows(contracts.data?.items)), unique(rows(invoices.data?.items)),
    rows(appointments.data?.items), rows(submissions.data?.items), Boolean(gateway), now) : [];
  const nextVisit = rows(appointments.data?.items)
    .filter(item => idOf(item) && ['REQUESTED', 'CONFIRMED'].includes(String(item.status)) && Date.parse(text(item, 'scheduledAt')) >= now)
    .sort((a, b) => Date.parse(text(a, 'scheduledAt')) - Date.parse(text(b, 'scheduledAt')))[0];
  const recent = unique(rows(reservations.data)).sort((a, b) =>
    (Date.parse(text(b, 'createdAt')) || 0) - (Date.parse(text(a, 'createdAt')) || 0)).slice(0, 1);
  const pendingInvoiceIds = new Set(rows(submissions.data?.items).filter(item => item.status === 'PENDING_VERIFICATION' ||
    Boolean(text(item, 'reconciliation.status') && text(item, 'reconciliation.status') !== 'RECONCILED'))
    .map(item => text(item, 'invoice.id')));
  const upcoming = !submissions.error && !submissions.loading && gateway
    ? rows(invoices.data?.items).filter(item => idOf(item) && outstanding(item) && !closedBooking(item) &&
      ['INITIAL', 'RECURRING', 'RENEWAL'].includes(String(item.type)) && !paymentWindowClosed(item, now) &&
      !invoicePaymentBlockedBySchedule(item, now) && !pendingInvoiceIds.has(idOf(item)) &&
      (item.type === 'RECURRING' ? object(item.signing).complete !== false : object(item.signing).complete === true))
      .sort((a, b) => (text(a, 'dueAt') || '9999').localeCompare(text(b, 'dueAt') || '9999'))[0]
    : undefined;
  return <ScrollView style={s.screen} contentInsetAdjustmentBehavior="never" contentContainerStyle={s.page}
    refreshControl={<RefreshControl refreshing={refreshing && loading} onRefresh={() => { setRefreshing(true); setNow(Date.now()); sources.forEach(source => source.refresh()); }} />}>
    <View style={s.heroFrame}>
      <CustomerHero topInset={top} compact>
        <Image source={require('../../../assets/images/customer-home-hero.png')} contentFit="cover" contentPosition="center"
          accessible={false} pointerEvents="none" style={StyleSheet.absoluteFill} />
        <View style={s.heroHeader}>
          <View style={s.grow}><Text style={s.logo}>NestBox</Text><Text style={s.heroMessage}>Xin chào{user?.fullName ? <Text style={s.greetingName}>{", " + user.fullName}</Text> : null}</Text></View>
          <CustomerNotifications inverse />
        </View>
        {rentals.loading && !rentals.data ? <Text style={s.heroMessage}>Đang tải kho của bạn…</Text>
          : rentals.error ? <Pressable accessibilityRole="button" onPress={rentals.refresh} style={s.profile}><Text style={s.heroMessage}>Chưa tải được kho · Thử lại</Text></Pressable>
          : <>
            <View style={[s.count, !count && s.emptyCount]}>
              <View style={s.countCopy}><Text style={s.heroMessage}>Bạn đang thuê</Text>
                <Text style={s.number}>{String(count).padStart(2, '0')}</Text>
                <Text style={s.heroMessage}>kho đang hoạt động</Text></View>
              {!count ? <View style={s.emptyIcon}><Warehouse size={56} color={C.onHeroSecondary} strokeWidth={1.4} /></View> : null}
              {count === 1 && <Pressable style={s.linkButton} accessibilityRole="link" accessibilityLabel="Xem tất cả kho đang thuê"
                onPress={() => go('/customer/rentals')}>
                <Text style={s.heroLink}>Xem tất cả</Text><ChevronRight size={14} color={C.onHeroSecondary} />
              </Pressable>}
            </View>
            {count > 0 ? <>
              <FlatList horizontal data={active} keyExtractor={({ contract }) => idOf(contract)}
                style={s.carousel} contentContainerStyle={s.carouselContent} showsHorizontalScrollIndicator={false}
                snapToInterval={stride} decelerationRate="fast" disableIntervalMomentum nestedScrollEnabled directionalLockEnabled
                scrollEnabled={count > 1} scrollEventThrottle={16}
                getItemLayout={(_, index) => ({ length: stride, offset: stride * index, index })}
                onScroll={({ nativeEvent }) => {
                  const index = Math.min(count - 1, Math.max(0, Math.round(nativeEvent.contentOffset.x / stride)));
                  setCardIndex(index);
                }}
                ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
                ListFooterComponent={count > 1 ? <View style={{ width: Math.max(0, availableWidth - 40 - cardWidth) }} /> : undefined}
                renderItem={({ item: { rental, contract } }) => {
                  const floor = text(contract, 'unit.floor').replace(/^ground(?: floor)?$/i, 'Tầng trệt').replace(/^(?:floor\s+)?(\d+)$/i, 'Tầng $1');
                  const zone = text(contract, 'unit.zone');
                  const location = [floor, zone && (/^khu\b/i.test(zone) ? zone : 'Khu ' + zone)].filter(Boolean).join(' · ');
                  const name = text(contract, 'unit.storageType.name') || storageName(rental) || 'Kho của bạn';
                  const facility = text(contract, 'unit.storageType.facility.name') || facilityName(rental);
                  const code = text(contract, 'unit.unitCode');
                  return <Pressable accessibilityRole="button" accessibilityLabel={[name, code, location, 'Thuê đến ' + formatDate(text(contract, 'endDate'))].filter(Boolean).join(', ')}
                    onPress={() => go('/customer/rentals/' + encodeURIComponent(idOf(rental)) + '?rentalContractId=' + encodeURIComponent(idOf(contract)))}
                    style={({ pressed }) => [s.storage, { width: cardWidth }, pressed && s.pressed]}>
                    <SmallIcon icon={Box} />
                    <View style={[s.grow, s.rentalCopy]}>
                      <View style={s.row}><Text style={[s.heading, s.grow]} numberOfLines={2}>{name}</Text><Text style={s.active}>Đang hoạt động</Text></View>
                      {code ? <View style={s.row}><Tag size={14} color={C.cobalt} /><Text style={s.secondary}>{code}</Text></View> : null}
                      {facility ? <View style={s.row}><Building2 size={14} color={C.cobalt} /><Text style={[s.secondary,s.grow]}>{facility}</Text></View> : null}
                      {location ? <View style={s.row}><MapPin size={14} color={C.cobalt} /><Text style={[s.secondary, s.grow]}>{location}</Text></View> : null}
                      <View style={s.row}><CalendarDays size={14} color={C.navy} /><Text style={s.secondary}>Đến {formatDate(text(contract, 'endDate'))}</Text></View>
                    </View>
                    <ChevronRight size={17} color={C.navy} />
                  </Pressable>;
                }} />
              {count > 1 && <View style={s.spread}>
                <View style={s.row}>{count > 1 ? <>
                  {count <= 7 && active.map(({ contract }, index) => <View key={idOf(contract)} style={[s.dot, index === current && s.activeDot]} />)}
                  <Text accessibilityLabel={`Kho ${current + 1} trên ${count}`} style={s.heroLink}>{current + 1}/{count}</Text>
                </> : null}</View>
                <Pressable style={s.linkButton} accessibilityRole="link" accessibilityLabel="Xem tất cả kho đang thuê" onPress={() => go('/customer/rentals')}>
                  <Text style={s.heroLink}>Xem tất cả</Text><ChevronRight size={14} color={C.onHeroSecondary} />
                </Pressable>
              </View>}
            </> : null}
          </>}
      </CustomerHero>
    </View>

    <View style={s.content}>
      {!rentals.loading && !rentals.error && !count ? <View style={s.welcome}>
        <Text style={s.sectionTitle}>Bạn chưa có kho đang sử dụng</Text>
        <Text style={[s.secondary, s.center]}>Tìm và đặt kho phù hợp với nhu cầu lưu trữ của bạn.</Text>
        <Pressable accessibilityRole="button" style={s.find} onPress={() => go('/customer/discover')}><Search size={17} color={C.onHero} /><Text style={s.findText}>Tìm kho phù hợp</Text></Pressable>
      </View> : null}
      <View style={s.shortcuts}>{shortcuts.map(({ title, path, icon }) => <Pressable key={path} accessibilityRole="button" onPress={() => go(path)} style={s.shortcut}>
        <SmallIcon icon={icon} /><Text style={s.shortcutText}>{title}</Text>
      </Pressable>)}</View>

      {taskLoading ? <LoadingState layout="compact" />
        : taskError ? <ErrorState message={taskError.error || 'Chưa tải được việc cần làm.'} onRetry={() => taskSources.forEach(source => source.refresh())} />
        : tasks.length ? <View style={s.tasks}>
          <View style={s.spread}><Text accessibilityRole="header" style={[s.sectionTitle, s.grow]}>Việc cần làm · {tasks.length}</Text>
            {tasks.length > 3 ? <Pressable accessibilityRole="button" accessibilityLabel="Xem tất cả việc cần làm" style={s.linkButton} onPress={() => setShowTasks(true)}><Text style={s.link}>Xem tất cả</Text><ChevronRight size={14} color={C.navy} /></Pressable> : null}
          </View>
          {tasks.slice(0, 3).map(task => <TaskRow key={task.key} task={task} onPress={() => go(task.path)} />)}
        </View> : <View style={s.recent}><Text accessibilityRole="header" style={s.sectionTitle}>Việc cần làm</Text>
          {!nextVisit && <View style={s.done}><SmallIcon icon={Check} /><View style={s.grow}>
            <Text style={s.heading}>Không có việc cần xử lý hôm nay.</Text>
            <Text style={s.secondary}>Mọi thứ đang được cập nhật đầy đủ.</Text>
          </View></View>}
        </View>}

      {nextVisit ? <Pressable accessibilityRole="link" style={s.booking} onPress={() => go('/customer/appointments/' + encodeURIComponent(idOf(nextVisit)))}>
        <SmallIcon icon={CalendarDays} /><View style={s.grow}>
          <Text style={s.heading}>Lịch nhận kho sắp tới</Text>
          <Text style={s.secondary}>{formatDate(text(nextVisit, 'scheduledAt'), true)} · {nextVisit.status === 'CONFIRMED' ? 'Đã xác nhận lịch' : 'Chờ xác nhận lịch'}</Text>
          {text(nextVisit, 'reservation.reference') ? <Text style={s.secondary}>{text(nextVisit, 'reservation.reference')}</Text> : null}
        </View><ChevronRight size={17} color={C.muted} />
      </Pressable> : null}

      {upcoming && <View style={s.recent}>
        <Text accessibilityRole="header" style={s.sectionTitle}>Hóa đơn sắp đến hạn</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={'Thanh toán qua ' + gateway + ' · ' + invoiceTitle(upcoming)}
          onPress={() => go('/customer/invoices/' + encodeURIComponent(idOf(upcoming)))} style={s.booking}>
          <SmallIcon icon={CreditCard} />
          <View style={s.grow}>
            <Text style={s.heading}>{invoiceTitle(upcoming)}</Text>
            <Text style={s.invoiceAmount}>{formatMoney(Number(upcoming.balanceDue))}</Text>
            {[storageName(upcoming), facilityName(upcoming)].filter(Boolean).length > 0 && <Text style={s.secondary}>{[storageName(upcoming), facilityName(upcoming)].filter(Boolean).join(' · ')}</Text>}
            <Text style={s.secondary}>{text(upcoming, 'dueAt') ? 'Đến hạn ' + formatDate(text(upcoming, 'dueAt')) + ' · ' : ''}{invoiceBadge(upcoming).label}</Text>
          </View>
          <View style={s.pay}><Text style={s.payText}>Thanh toán qua {gateway}</Text></View>
        </Pressable>
      </View>}
      <View style={s.recent}>
        <View style={s.spread}><Text accessibilityRole="header" style={[s.sectionTitle, s.grow]}>Đơn đặt gần đây</Text>
          <Pressable accessibilityRole="link" accessibilityLabel="Xem tất cả đơn đặt" style={s.linkButton} onPress={() => go('/customer/reservations')}><Text style={s.link}>Xem tất cả</Text><ChevronRight size={14} color={C.navy} /></Pressable>
        </View>
        {reservations.loading ? <LoadingState layout="compact" /> : reservations.error ? <ErrorState message={reservations.error} onRetry={reservations.refresh} />
          : recent.length ? recent.map(row => <Pressable key={idOf(row)} accessibilityRole="button" onPress={() => go('/customer/reservations/' + encodeURIComponent(idOf(row)))} style={s.booking}>
            <SmallIcon icon={Box} /><View style={s.grow}><Text style={s.heading}>{storageName(row) || 'Đơn đặt kho'}</Text>
              <Text style={s.secondary}>{text(row, 'reference', 'id')}</Text>{facilityName(row) ? <Text style={s.secondary}>{facilityName(row)}</Text> : null}
              <View style={s.bookingMeta}><StatusBadge status={String(row.status)} displayLabel={bookingStatusText[String(row.status)]} />
                {text(row, 'createdAt') ? <Text style={s.secondary}>Đặt {formatDate(text(row, 'createdAt'))}</Text> : null}</View>
            </View><ChevronRight size={17} color={C.muted} />
          </Pressable>) : <Pressable accessibilityRole="button" style={s.booking} onPress={() => go('/customer/discover')}><SmallIcon icon={Search} /><View style={s.grow}><Text style={s.heading}>Bạn chưa có đơn đặt kho.</Text><Text style={s.link}>Tìm kho</Text></View><ChevronRight size={17} color={C.muted} /></Pressable>}
      </View>
    </View>

    <Modal visible={showTasks} animationType="slide" transparent onRequestClose={() => setShowTasks(false)}>
      <View style={s.scrim}><SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.spread}><Text style={s.sectionTitle}>Việc cần làm · {tasks.length}</Text>
          <Pressable style={s.profile} accessibilityRole="button" accessibilityLabel="Đóng danh sách" onPress={() => setShowTasks(false)}><X size={22} color={C.text} /></Pressable>
        </View>
        <ScrollView>{tasks.length ? tasks.map(task => <TaskRow key={task.key} task={task} onPress={() => { setShowTasks(false); go(task.path); }} />)
          : <Text style={s.secondary}>Bạn đã hoàn tất các việc cần làm.</Text>}</ScrollView>
      </SafeAreaView></View>
    </Modal>
  </ScrollView>;
}

const s = StyleSheet.create({
  screen: { backgroundColor: C.surface },
  page: { paddingBottom: 24 },
  heroFrame: { borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden', width: '100%', maxWidth: 540, alignSelf: 'center' },
  heroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { fontSize: 26, fontWeight: '800', color: C.onHero },
  profile: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  count: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingVertical: 3 },
  emptyCount: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  emptyIcon: { width: 102, height: 86, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: C.heroControl },
  number: { fontSize: 42, lineHeight: 50, fontWeight: '800', color: C.onHero },
  heroMessage: { color: C.onHero, fontSize: 14, lineHeight: 20 },
  countCopy: { borderLeftWidth: 3, borderLeftColor: '#52ACFF', paddingLeft: 12 },
  greetingName: { fontWeight: '800' },
  done: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 12, backgroundColor: '#EDF4FF', padding: 9 },
  invoiceAmount: { color: '#0758DC', fontSize: 17, fontWeight: '800' },
  pay: { backgroundColor: '#0758DC', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 9, maxWidth: '34%' },
  payText: { color: 'white', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  center: { textAlign: 'center' },
  carousel: { marginHorizontal: -20 },
  carouselContent: { paddingHorizontal: 20 },
  storage: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 10, borderRadius: 15, backgroundColor: '#EEF5FF', minHeight: 97 },
  pressed: { opacity: 0.76 },
  grow: { flex: 1, minWidth: 0, gap: 4 },
  rentalCopy: { gap: 2 },
  heading: { color: C.text, fontSize: 14, fontWeight: '700' },
  sectionTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
  secondary: { color: C.muted, fontSize: 12, lineHeight: 17 },
  active: { color: C.success, backgroundColor: C.successBackground, fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', flexShrink: 1 },
  row: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  linkButton: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 2 },
  heroLink: { color: C.onHeroSecondary, fontSize: 13, fontWeight: '600' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#8AA9D7', marginRight: 2 },
  activeDot: { backgroundColor: C.onHero },
  content: { width: '100%', maxWidth: 540, alignSelf: 'center', paddingHorizontal: 13, paddingTop: 12, gap: 16 },
  welcome: { alignItems: 'center', gap: 6, paddingVertical: 7 },
  find: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, gap: 7, backgroundColor: C.navy, borderRadius: 10, paddingHorizontal: 22, marginTop: 5 },
  findText: { color: C.onHero, fontSize: 14, fontWeight: '700' },
  shortcuts: { flexDirection: 'row', gap: 6 },
  shortcut: { flex: 1, alignItems: 'center', gap: 5, minHeight: 62, justifyContent: 'center' },
  shortcutText: { color: C.text, fontSize: 13, textAlign: 'center' },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.tealSubtle },
  warmIcon: { backgroundColor: '#FFF0D9' },
  tasks: { borderRadius: 14, backgroundColor: '#FFF9EE', paddingHorizontal: 10, paddingBottom: 5 },
  taskRow: { minHeight: 58, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.divider },
  link: { color: C.navy, fontSize: 13, fontWeight: '700' },
  recent: { gap: 7 },
  booking: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: C.divider, borderRadius: 12 },
  bookingMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  scrim: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: C.surface, padding: 14 },
});
