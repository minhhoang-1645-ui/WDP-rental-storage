import { useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { CalendarDays, Check, ChevronRight, Clock, Headphones, Info, MapPin, Warehouse } from 'lucide-react-native';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { useResource } from '@/operations/use-resource';
import { operationMutate } from '@/operations/mutate';
import { idOf, object, rows, text, type Row } from '@/operations/model';
import { formatDate } from '@/utils/format';
import { handoverWindow, keyCollectionStartDate, vietnamLocalMinute } from '@/utils/handover';
import { ErrorState, LoadingState } from './screen-state';
import { StatusBadge } from './customer-ui';

const root = '/customer/appointments';
const open = (path: string) => router.push(path as Href);
const reservationOf = (row: Row) => text(row, 'reservation.id');
const nameOf = (group: Row[]) => text(group[0] ?? {}, 'storageType.name') || 'Kho đã đặt';
const two = (value: number) => String(value).padStart(2, '0');
const local = (value: string) => value && Number.isFinite(Date.parse(value)) ? vietnamLocalMinute(Date.parse(value)) : '';
const nextDay = (date: string) => new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
const weekday = (date: string) => new Intl.DateTimeFormat('vi-VN', { weekday: 'long', timeZone: 'UTC' }).format(new Date(date));
const locationOf = (unit: Row) => {
  const floor = text(unit, 'floor').replace(/^ground(?: floor)?$/i, 'Tầng trệt').replace(/^(?:floor\s+)?(\d+)$/i, 'Tầng $1');
  const zone = text(unit, 'zone');
  return [floor, zone && (/^khu\b/i.test(zone) ? zone : 'Khu ' + zone)].filter(Boolean).join(' · ');
};
const status = (row: Row) => row.status === 'COMPLETED' ? 'Đã bàn giao' : row.status === 'CONFIRMED' ? 'Đã xác nhận' : row.status === 'CANCELLED' ? 'Đã hủy' : 'Chờ xác nhận';

function Page({ title, children, refresh, loading }: { title: string; children: ReactNode; refresh?: () => void; loading?: boolean }) {
  return <ScrollView style={s.screen} contentContainerStyle={s.page} contentInsetAdjustmentBehavior="automatic"
    refreshControl={refresh ? <RefreshControl refreshing={Boolean(loading)} onRefresh={refresh} /> : undefined}>
    <Stack.Screen options={{ title, headerTitleAlign: 'center', headerTitleStyle: { color: C.cobalt, fontSize: 19, fontWeight: '700' } }} />
    {children}
  </ScrollView>;
}

function Button({ label, onPress, disabled, outline }: { label: string; onPress: () => void; disabled?: boolean; outline?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[s.button, outline && s.outline, disabled && s.disabled]}><Text style={[s.buttonText, outline && s.blue]}>{label}</Text></Pressable>;
}

function Day({ date, selected, onPress }: { date: string; selected?: boolean; onPress?: () => void }) {
  const content = <><Text style={[s.caption, selected && s.white]}>{weekday(date)}</Text>
    <Text style={[s.dayNumber, selected && s.white]}>{Number(date.slice(8, 10))}</Text>
    <Text style={[s.caption, selected && s.white]}>Thg {Number(date.slice(5, 7))}</Text></>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={formatDate(date)} accessibilityState={{ selected }} onPress={onPress}
    style={[s.day, selected && s.selected]}>{content}</Pressable> : <View style={s.day}>{content}</View>;
}

function Booking({ group, first, end, start }: { group: Row[]; first: string; end: string; start: string }) {
  const reservationId = reservationOf(group[0]);
  const [day, setDay] = useState(first);
  const [hour, setHour] = useState<number>();
  const [minute, setMinute] = useState(0);
  const [limit, setLimit] = useState(14);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const days: string[] = [];
  for (let date = first; date < end && days.length < limit; date = nextDay(date)) days.push(date);
  const selectedDay = day < first ? first : day;
  const clock = vietnamLocalMinute();
  const earliest = selectedDay === clock.slice(0, 10) ? Number(clock.slice(11, 13)) * 60 + Number(clock.slice(14, 16)) + 1 : 0;
  const time = hour === undefined ? '' : two(hour) + ':' + two(minute);
  async function submit() {
    if (submitting.current || !time) return;
    const scheduledAt = selectedDay + 'T' + time;
    if (scheduledAt <= vietnamLocalMinute() || selectedDay < first || selectedDay >= end) {
      setError('Giờ đã chọn không còn hợp lệ. Vui lòng chọn lại.');
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const item = await operationMutate(root, 'POST', { reservationId, scheduledAt: scheduledAt + ':00+07:00' }, true);
      router.replace((root + '/' + encodeURIComponent(idOf(item))) as Href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chưa đặt được lịch. Vui lòng thử lại.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  const place = group.length === 1 ? locationOf(object(group[0].storageUnit)) : '';
  return <Page title="Đặt lịch nhận">
    <View style={[s.card, s.tint, s.row]}><Warehouse size={24} color={C.cobalt} />
      <View style={s.grow}><Text style={s.title}>{nameOf(group)}{group.length > 1 ? ' · ' + group.length + ' ô kho' : ''}</Text>
        <Text style={s.copy}>Bắt đầu thuê {formatDate(start)}</Text>
        {place ? <Text style={s.copy}>{place}</Text> : null}
      </View>
    </View>
    <Text style={s.title}>Chọn ngày nhận kho</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choices}>
      {days.map(date => <Day key={date} date={date} selected={date === selectedDay} onPress={() => { setDay(date); setHour(undefined); setError(''); }} />)}
      {days.length === limit && nextDay(days[days.length - 1]) < end ? <Button label="Thêm ngày" outline onPress={() => setLimit(limit + 14)} /> : null}
    </ScrollView>
    <Text style={s.title}>Chọn giờ nhận kho</Text>
    <Text style={s.copy}>Giờ Việt Nam (UTC+7)</Text>
    {([['Giờ', 24, Math.floor(earliest / 60), hour, (value: number) => { setHour(value); setMinute(Math.max(0, earliest - value * 60)); setError(''); }],
      ['Phút', 60, hour === undefined ? 60 : Math.max(0, earliest - hour * 60), minute, (value: number) => { setMinute(value); setError(''); }]] as const).map(([label, total, start, value, select]) => start < total ?
        <View key={label} style={s.row}><Text style={s.copy}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choices} key={selectedDay + start}>
          {Array.from({ length: total - start }, (_, index) => start + index).map(option =>
            <Pressable key={option} accessibilityRole="button" accessibilityLabel={option + ' ' + label.toLowerCase()} accessibilityState={{ selected: option === value }}
              style={[s.chip, option === value && s.selected]} onPress={() => select(option)}><Text style={[s.label, option === value && s.white]}>{two(option)}</Text></Pressable>)}
        </ScrollView></View> : null)}
    <Notice>{selectedDay < start ? `Bạn có thể nhận chìa khóa sớm và sử dụng kho từ ${formatDate(start)}.` : 'Nhân viên sẽ bàn giao kho tại cơ sở.'}</Notice>
    {time ? <Text style={s.label}>Lịch đã chọn · {formatDate(selectedDay)} lúc {time}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <Button label={saving ? 'Đang xác nhận…' : 'Xác nhận lịch'} disabled={saving || !time} onPress={submit} />
  </Page>;
}

function Notice({ children, warm }: { children: ReactNode; warm?: boolean }) {
  return <View style={[s.notice, warm && s.warm]}><Info size={18} color={warm ? '#914B00' : C.cobalt} /><Text style={[s.grow, s.copy]}>{children}</Text></View>;
}

function Detail({ id }: { id: string }) {
  const source = useResource<Row>(root + '/' + encodeURIComponent(id));
  const contracts = useResource<Row>('/customer/contracts', true);
  const [showLocations, setShowLocations] = useState(false);
  const row = source.data;
  const completed = row?.status === 'COMPLETED';
  const title = completed ? 'Bàn giao kho' : 'Chi tiết lịch nhận';
  if (!row) return <Page title={title}>{source.error ? <ErrorState message={source.error} onRetry={source.refresh} /> : <LoadingState layout="detail" />}</Page>;
  const units = rows(row.allocatedUnits);
  const group = rows(contracts.data?.items).filter(item => reservationOf(item) === reservationOf(row));
  const start = units.map(unit => text(unit, 'contractStartDate')).filter(Boolean).sort().at(-1);
  const date = local(text(row, 'scheduledAt'));
  const early = completed && row.usageStatus === 'WAITING_FOR_RENTAL_START' && start && start > vietnamLocalMinute().slice(0, 10);
  const active = completed && row.usageStatus === 'ACTIVE';
  const waiting = row.status === 'CONFIRMED' || row.status === 'REQUESTED';
  const rid = encodeURIComponent(reservationOf(row));
  return <Page title={title} refresh={() => { source.refresh(); contracts.refresh(); }} loading={source.loading}>
    {completed ? <View style={s.successHero}><View style={s.check}><Check size={24} color="white" /></View>
      <Text style={s.successTitle}>Đã bàn giao chìa khóa</Text>
      {row.completedAt ? <Text style={s.copy}>{formatDate(text(row, 'completedAt'), true)}</Text> : null}
    </View> : <View style={[s.card, s.tint, s.row]}><CalendarDays size={28} color={C.cobalt} /><View style={s.grow}>
      <Text style={s.title}>{date ? weekday(date.slice(0, 10)) + ', ' + formatDate(date.slice(0, 10)) : 'Ngày nhận kho'}</Text>
      {date ? <Text style={s.label}>{date.slice(11)}</Text> : null}
      <StatusBadge status={String(row.status)} tone={row.status === 'CONFIRMED' ? 'success' : undefined} displayLabel={status(row)} />
    </View></View>}
    <View style={s.section}>
      <Text style={s.title}>{nameOf(group)}{units.length > 1 ? ' · ' + units.length + ' ô kho' : ''}</Text>
      {active ? units.map(unit => {
        const unitId = text(unit, 'unitId');
        const contract = group.find(item => text(item, 'contractCode') === text(unit, 'contractCode') && text(item, 'storageUnit.id') === unitId);
        const query = 'rentalContractId=' + encodeURIComponent(idOf(contract ?? {}));
        return <View key={unitId} style={s.unit}><Warehouse size={18} color={C.cobalt} /><View style={s.grow}>
          <Text style={s.label}>{text(unit, 'unitCode')}</Text>
          {locationOf(unit) ? <Text style={s.copy}>{locationOf(unit)}</Text> : null}
          {contract?.status === 'ACTIVE' ? <View style={s.row}>
            <Button label="Vị trí kho" outline onPress={() => open('/customer/floor-plan?rentalId=' + rid + '&' + query)} />
            <Button label="Chi tiết kho" outline onPress={() => open('/customer/rentals/' + rid + '?' + query)} />
          </View> : null}
        </View></View>;
      }) : null}
      {start ? <Text style={s.copy}>Bắt đầu thuê · {formatDate(start)}</Text> : null}
      {waiting ? <StatusBadge status="REQUESTED" tone="warning" displayLabel="Chờ nhân viên bàn giao" /> : null}
    </View>
    {early ? <Notice warm>Bạn có thể sử dụng kho từ {formatDate(start)}.</Notice> : null}
    {completed ? <View style={s.section}><Text style={s.title}>Tiến trình</Text>
      {row.confirmedAt ? <Milestone title="Lịch đã xác nhận" date={formatDate(text(row, 'confirmedAt'), true)} /> : null}
      <Milestone title="Nhân viên đã bàn giao" date={row.completedAt ? formatDate(text(row, 'completedAt'), true) : undefined} />
      {active ? <Milestone title="Kho đang hoạt động" /> : early ? <Milestone title="Chờ đến ngày bắt đầu thuê" date={formatDate(start)} pending /> : null}
    </View> : waiting ? <View style={s.section}><Text style={s.title}>Khi đến nhận kho</Text>
      <View style={s.notice}><Check size={17} color={C.cobalt} /><Text style={[s.copy, s.grow]}>Mang giấy tờ tùy thân để nhân viên đối chiếu.</Text></View>
      <View style={s.notice}><Check size={17} color={C.cobalt} /><Text style={[s.copy, s.grow]}>Kiểm tra kho cùng nhân viên và nhận chìa khóa hoặc thẻ cùng giấy tờ bàn giao.</Text></View>
    </View> : null}
    {!active && units.length > 0 ? <>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showLocations }} onPress={() => setShowLocations(value => !value)} style={s.link}>
        <MapPin size={18} color={C.cobalt} /><Text style={[s.label, s.grow]}>{showLocations ? 'Ẩn vị trí kho' : 'Xem vị trí kho'}</Text><ChevronRight size={16} color={C.muted} />
      </Pressable>
      {showLocations ? <View style={s.section}>{units.map(unit => <Text key={text(unit, 'unitId')} style={s.copy}>{[text(unit, 'unitCode'), locationOf(unit)].filter(Boolean).join(' · ')}</Text>)}</View> : null}
    </> : null}
    <Pressable accessibilityRole="button" onPress={() => open('/customer/support-requests')} style={s.link}><Headphones size={18} color={C.cobalt} /><Text style={[s.label, s.grow]}>Liên hệ nhân viên</Text><ChevronRight size={16} color={C.muted} /></Pressable>
    {rid ? <Button label="Xem đơn đặt" outline onPress={() => open('/customer/reservations/' + rid)} /> : null}
  </Page>;
}

function Milestone({ title, date, pending }: { title: string; date?: string; pending?: boolean }) {
  return <View style={s.row}><View style={[s.milestone, pending && s.pending]}>{pending ? null : <Check size={12} color="white" />}</View>
    <View style={s.grow}><Text style={s.label}>{title}</Text>{date ? <Text style={s.copy}>{date}</Text> : null}</View>
  </View>;
}

export function CustomerAppointments({ id }: { id?: string }) {
  return id ? <Detail id={id} /> : <Overview />;
}

function Overview() {
  const { reservationId, book } = useLocalSearchParams<{ reservationId?: string; book?: string }>();
  const [history, setHistory] = useState(false);
  const appointments = useResource<Row>(root, true);
  const contracts = useResource<Row>('/customer/contracts', true);
  const invoices = useResource<Row>('/customer/invoices', true);
  const sources = [appointments, contracts, invoices];
  const loading = sources.some(item => item.loading);
  const error = sources.find(item => item.error)?.error;
  const refresh = () => sources.forEach(item => item.refresh());
  const visits = rows(appointments.data?.items);
  const groups = new Map<string, Row[]>();
  for (const contract of rows(contracts.data?.items)) {
    const key = reservationOf(contract);
    if (key) groups.set(key, [...(groups.get(key) ?? []), contract]);
  }
  const clock = vietnamLocalMinute();
  const today = clock.slice(0, 10);
  const firstFutureDay = clock.endsWith('23:59') ? nextDay(today) : today;
  const leadDays = appointments.data?.handoverLeadDays;
  const initialInvoices = rows(invoices.data?.items).filter(invoice => invoice.type === 'INITIAL');
  const eligible = [...groups].flatMap(([key, group]) => {
    const initial = initialInvoices.filter(invoice => reservationOf(invoice) === key);
    const { start, end } = handoverWindow(group.map(item => ({ startDate: text(item, 'startDate'), endDate: text(item, 'endDate') })));
    if (!start || !end || typeof leadDays !== 'number' || !Number.isInteger(leadDays) || leadDays < 0 ||
        text(group[0], 'reservation.status') !== 'CONFIRMED' || group.length !== Number(text(group[0], 'reservation.quantity')) ||
        initial.length !== 1 || initial[0].status !== 'PAID' || Number(initial[0].balanceDue) !== 0 ||
        group.some(item => item.status !== 'READY_FOR_HANDOVER' || !text(item, 'terms.acceptedAt') || !text(item, 'storageUnit.id')) ||
        new Set(group.map(item => text(item, 'storageUnit.id'))).size !== group.length ||
        visits.some(item => reservationOf(item) === key && ['REQUESTED', 'CONFIRMED', 'COMPLETED'].includes(String(item.status)))) return [];
    const first = [keyCollectionStartDate(start, leadDays), firstFutureDay].sort()[1];
    return first < end ? [{ key, group, first, end, start }] : [];
  });
  const selectedKey = reservationId && [...groups].find(([key, group]) => key === reservationId || text(group[0], 'reservation.reference') === reservationId)?.[0];
  const selected = eligible.find(item => item.key === selectedKey);
  const pending = visits.filter(item => item.status === 'CONFIRMED' || item.status === 'REQUESTED')
    .sort((a, b) => text(a, 'scheduledAt').localeCompare(text(b, 'scheduledAt')));
  const visible = history ? visits.filter(item => item.status === 'COMPLETED') : pending;
  const cancelled = !history ? visits.filter(item => item.status === 'CANCELLED') : [];
  if (!loading && !error && book === '1' && selected) return <Booking key={selected.key} group={selected.group} first={selected.first} end={selected.end} start={selected.start} />;
  return <Page title={book === '1' ? 'Đặt lịch nhận' : 'Lịch nhận kho'} refresh={refresh} loading={loading}>
    {error ? <ErrorState message={error} onRetry={refresh} /> : loading ? <LoadingState layout="detail" /> : book === '1' ?
      <Notice>Đơn này hiện chưa thể đặt lịch. Kiểm tra lại đơn đặt hoặc lịch đã xác nhận.</Notice> : <>
      <View style={s.tabs}>{(['Sắp tới (' + pending.length + ')', 'Đã bàn giao']).map((label, index) =>
        <Pressable key={index} accessibilityRole="tab" accessibilityState={{ selected: history === Boolean(index) }} onPress={() => setHistory(Boolean(index))}
          style={[s.tab, history === Boolean(index) && s.selected]}><Text style={[s.label, history === Boolean(index) && s.white]}>{label}</Text></Pressable>)}</View>
      {!visible.length ? <Text style={s.copy}>{history ? 'Chưa có lịch đã bàn giao.' : 'Bạn chưa có lịch nhận kho sắp tới.'}</Text> : null}
      {[...visible, ...cancelled].map(item => {
        const date = local(text(item, 'scheduledAt'));
        const units = rows(item.allocatedUnits);
        const name = nameOf(groups.get(reservationOf(item)) ?? []);
        return <Pressable key={idOf(item)} accessibilityRole="button" onPress={() => open(root + '/' + encodeURIComponent(idOf(item)))} style={[s.card, s.row, !history && item.status !== 'CANCELLED' && s.tint]}>
          {date ? <Day date={date.slice(0, 10)} /> : null}<View style={s.grow}>
            <Text style={s.title}>{name}{units.length > 1 ? ' · ' + units.length + ' ô kho' : ''}</Text>
            <StatusBadge status={String(item.status)} tone={item.status === 'CONFIRMED' ? 'success' : undefined} displayLabel={status(item)} />
            {date ? <View style={s.row}><Clock size={14} color={C.muted} /><Text style={s.copy}>{date.slice(11)}</Text></View> : null}
            {item.status === 'CONFIRMED' ? <Text style={s.copy}>Bàn giao · Chờ nhân viên</Text> : null}
          </View><ChevronRight size={18} color={C.muted} />
        </Pressable>;
      })}
      {!history ? eligible.map(item => <View key={item.key} style={[s.card, s.row]}>
        <Day date={item.first} /><View style={s.grow}><Text style={s.title}>{nameOf(item.group)}{item.group.length > 1 ? ' · ' + item.group.length + ' ô kho' : ''}</Text>
          <StatusBadge status="REQUESTED" displayLabel="Có thể đặt lịch" />
          <Text style={s.copy}>Bắt đầu thuê · {formatDate(item.start)}</Text>
          <Button label="Chọn lịch nhận" onPress={() => open(root + '?book=1&reservationId=' + encodeURIComponent(item.key))} />
        </View>
      </View>) : null}
      {!history && typeof leadDays !== 'number' && groups.size > 0 ? <Notice>Chưa tải được quy định ngày nhận kho. Kéo xuống để thử lại.</Notice> : null}
      {!history && typeof leadDays === 'number' && reservationId && !selected && !pending.some(item => reservationOf(item) === selectedKey) && !visits.some(item => reservationOf(item) === selectedKey && item.status === 'COMPLETED') ?
        <Notice>Đơn được đặt lịch sau khi ký đủ hợp đồng và thanh toán hóa đơn ban đầu.</Notice> : null}
    </>}
  </Page>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF' },
  page: { padding: 16, paddingBottom: 24, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1, minWidth: 0, gap: 5 },
  title: { fontSize: 16, fontWeight: '700', color: C.text, textTransform: 'none' },
  copy: { fontSize: 13, lineHeight: 18, color: C.muted },
  label: { fontSize: 14, fontWeight: '600', color: C.text },
  caption: { fontSize: 10, color: C.muted, textTransform: 'uppercase' },
  card: { borderWidth: 1, borderColor: '#E1E7F0', borderRadius: 13, padding: 10, gap: 12 },
  tint: { backgroundColor: '#EAF0FC', borderColor: '#EAF0FC' },
  day: { minWidth: 63, minHeight: 72, borderRadius: 9, borderWidth: 1, borderColor: '#E1E7F0', backgroundColor: '#F8FAFF', alignItems: 'center', justifyContent: 'center', padding: 5 },
  dayNumber: { fontSize: 24, fontWeight: '800', color: C.cobalt },
  choices: { alignItems: 'center', gap: 6 },
  tabs: { flexDirection: 'row', backgroundColor: '#EFF2F8', borderRadius: 22, padding: 2 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, minHeight: 44, borderRadius: 20 },
  selected: { backgroundColor: C.cobalt, borderColor: C.cobalt },
  white: { color: 'white' },
  blue: { color: C.cobalt },
  chip: { minWidth: 45, minHeight: 44, borderWidth: 1, borderColor: '#E1E7F0', borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 44, justifyContent: 'center', alignItems: 'center', padding: 9, borderRadius: 11, backgroundColor: C.cobalt, borderWidth: 1, borderColor: C.cobalt },
  outline: { backgroundColor: 'white' },
  disabled: { opacity: 0.55 },
  buttonText: { color: 'white', fontSize: 14, fontWeight: '700' },
  notice: { borderRadius: 10, padding: 10, backgroundColor: '#EEF3FF', flexDirection: 'row', alignItems: 'center', gap: 8 },
  warm: { backgroundColor: '#FFF0CB' },
  error: { color: '#AA231A', fontSize: 13 },
  section: { gap: 8, paddingVertical: 4 },
  unit: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E1E7F0' },
  successHero: { alignItems: 'center', gap: 6, paddingVertical: 10 },
  check: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#11803B', alignItems: 'center', justifyContent: 'center' },
  milestone: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#11803B', alignItems: 'center', justifyContent: 'center' },
  pending: { backgroundColor: 'white', borderWidth: 1, borderColor: C.muted },
  successTitle: { color: '#087334', fontWeight: '800', fontSize: 18 },
  link: { flexDirection: 'row', minHeight: 44, alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E1E7F0' },
});
