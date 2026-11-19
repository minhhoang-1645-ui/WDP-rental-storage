import { useRef, useState, type ReactNode } from 'react';
import { Clipboard, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronDown, ChevronRight, CreditCard, Headphones, Info, Plus, Search } from 'lucide-react-native';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { idOf, rows, text, type Row } from '@/operations/model';
import { operationMutate } from '@/operations/mutate';
import { useResource } from '@/operations/use-resource';
import { useDraftGuard } from '@/services/live-events';
import { formatDate } from '@/utils/format';
import { recordMatches } from '@/utils/record-search';
import { EARLY_RETURN_SUBJECT } from '@/utils/early-return';
import { ErrorState, LoadingState } from './screen-state';

export const supportPath = '/customer/support-requests';
const categories = {
  OTHER: 'Hỗ trợ khác', PAYMENT_SUPPORT: 'Hóa đơn & thanh toán', UNIT_ISSUE: 'Vấn đề với kho',
  LOCK_OR_KEY_ISSUE: 'Khóa hoặc chìa khóa', ACCESS_CODE_ISSUE: 'Mã truy cập',
  FACILITY_EQUIPMENT_FAILURE: 'Lỗi thiết bị cơ sở', STORED_ITEM_CONCERN: 'Vấn đề về hàng đang lưu',
};
type Category = keyof typeof categories;
const endpoint = supportPath;
const go = (path: string) => router.push(path as Href);
const reservation = (row: Row) => text(row, 'reservation.id');
const categoryName = (row: Row) => categories[text(row, 'category') as Category] ?? '';
const invoiceTitle = (row: Row) => ({ INITIAL: 'Hóa đơn ban đầu', RECURRING: 'Hóa đơn tiền thuê', RENEWAL: 'Hóa đơn gia hạn', FINAL: 'Hóa đơn quyết toán' })[text(row, 'type') as 'INITIAL' | 'RECURRING' | 'RENEWAL' | 'FINAL'] ?? 'Hóa đơn';
const badgeLabels: Record<string, string> = { OPEN: 'Đã tiếp nhận', ASSIGNED: 'Đã phân công', IN_PROGRESS: 'Đang xử lý', ESCALATED: 'Đang xem xét', RESOLVED: 'Đã giải quyết' };
const context = (row: Row) => text(row, 'unit.storageType.name', 'unit.unitCode') || (text(row, 'invoice.invoiceCode') ? 'Hóa đơn ' + text(row, 'invoice.invoiceCode') : text(row, 'reservation.reference') ? 'Đơn đặt kho' : '');
const bookingName = (row: Row) => text(row, 'storageType.name', 'product.name') || 'Đơn đặt kho';

function Page({ title, children, refresh }: { title: string; children: ReactNode; refresh?: { busy: boolean; run: () => void } }) {
  return <ScrollView style={s.screen} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
    contentInsetAdjustmentBehavior="automatic" refreshControl={refresh ? <RefreshControl refreshing={refresh.busy} onRefresh={refresh.run} /> : undefined}>
    <Stack.Screen options={{ title, headerTitleAlign: 'center', headerTitleStyle: { color: C.cobalt, fontSize: 19, fontWeight: '700' } }} />
    {children}
  </ScrollView>;
}
function Badge({ row }: { row: Row }) {
  const done = row.status === 'RESOLVED';
  return <Text style={[s.badge, done && s.done]}>{badgeLabels[text(row, 'status')] ?? 'Đang xem xét'}</Text>;
}
function Action({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button, disabled && { opacity: 0.55 }]}>
    <Text style={s.white}>{title}</Text>
  </Pressable>;
}

export function CustomerSupportList() {
  const source = useResource<Row>(endpoint, true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(0);
  const tickets = rows(source.data?.items);
  const counts = [tickets.length, tickets.filter(item => item.status !== 'RESOLVED').length, tickets.filter(item => item.status === 'RESOLVED').length];
  const visible = tickets.filter(item => (!filter || (item.status === 'RESOLVED') === (filter === 2)) &&
    recordMatches([text(item, 'subject', 'supportCode'), text(item, 'supportCode'), context(item), categoryName(item), badgeLabels[text(item, 'status')]], query));
  return <Page title="Hỗ trợ" refresh={{ busy: source.loading, run: source.refresh }}>
    <View style={s.row}><View style={s.grow}><Text style={s.title}>Yêu cầu hỗ trợ</Text><Text style={s.muted}>Theo dõi và gửi yêu cầu của bạn.</Text></View>
      <Action title="+ Tạo mới" onPress={() => go(supportPath + '/new')} /></View>
    {tickets.length ? <><View style={[s.row, s.input]}><Search size={17} color={C.muted} />
      <TextInput style={[s.grow, s.fieldText]} value={query} onChangeText={setQuery} accessibilityLabel="Tìm yêu cầu" placeholder="Tìm yêu cầu…" />
    </View><View style={s.filters}>{['Tất cả', 'Đang xử lý', 'Đã giải quyết'].map((label, index) =>
      <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: filter === index }} onPress={() => setFilter(index)} style={[s.chip, filter === index && s.selected]}>
        <Text style={filter === index ? s.white : s.label}>{label} ({counts[index]})</Text></Pressable>)}</View></> : null}
    {source.error ? <ErrorState message={source.error} onRetry={source.refresh} /> : source.loading ? <LoadingState layout="compact" /> : <>
      {visible.length ? visible.map(item => <Pressable accessibilityRole="button" key={idOf(item)} style={[s.row, s.line]} onPress={() => go(supportPath + '/' + encodeURIComponent(idOf(item)))}>
        <View style={s.icon}>{item.category === 'PAYMENT_SUPPORT' ? <CreditCard size={19} color={C.cobalt} /> : <Headphones size={19} color={C.cobalt} />}</View>
        <View style={s.grow}><Text style={s.label}>{text(item, 'subject')}</Text>{context(item) ? <Text style={s.muted}>{context(item)}</Text> : null}
          <Text style={s.muted}>Cập nhật {formatDate(text(item, 'updatedAt', 'createdAt'), true)}</Text><Badge row={item} /></View><ChevronRight size={17} color={C.muted} />
      </Pressable>) : <Text style={s.muted}>{tickets.length ? 'Không có yêu cầu phù hợp.' : 'Bạn chưa có yêu cầu hỗ trợ.'}</Text>}
    </>}
  </Page>;
}

type Option = { id: string; title: string; caption?: string };
function Picker({ title, value, options, onSelect, disabled }: { title: string; value: string; options: Option[]; onSelect: (id: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <View style={s.group}><Text style={s.label}>{title}</Text>
    <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ expanded: open, disabled }} style={[s.row, s.input]} onPress={() => setOpen(true)}>
      <Text style={[s.fieldText, s.grow]}>{options.find(item => item.id === value)?.title ?? 'Chọn ' + title.toLowerCase()}</Text><ChevronDown size={16} color={C.muted} />
    </Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <SafeAreaView edges={['bottom']} style={s.overlay}><View style={s.sheet}><Text style={s.title}>{title}</Text>
        <ScrollView keyboardShouldPersistTaps="handled">
          {options.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: item.id === value }}
            style={[s.row, s.line]} onPress={() => { onSelect(item.id); setOpen(false); }}>
            <View style={s.grow}><Text style={s.label}>{item.title}</Text>{item.caption ? <Text style={s.muted}>{item.caption}</Text> : null}</View>
            {item.id === value ? <Check size={18} color={C.cobalt} /> : null}
          </Pressable>)}
        </ScrollView>
        <Action title="Đóng" onPress={() => setOpen(false)} />
      </View></SafeAreaView>
    </Modal>
  </View>;
}

export function CustomerSupportCreate() {
  const params = useLocalSearchParams<{ invoiceId?: string; reservationId?: string; rentalContractId?: string; category?: string; subject?: string }>();
  const [category, setCategory] = useState<Category>(params.invoiceId || params.category === 'PAYMENT_SUPPORT' ? 'PAYMENT_SUPPORT' : 'OTHER');
  const [invoiceId, setInvoice] = useState(params.invoiceId ?? '');
  const [bookingId, setBooking] = useState(params.reservationId ?? '');
  const [contractId, setContract] = useState(params.rentalContractId ?? '');
  const [subject, setSubject] = useState(params.subject?.slice(0, 200) ?? '');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useDraftGuard(Boolean(subject || description || busy));
  const bookings = useResource<Row[]>('/reservations', false, true);
  const invoices = useResource<Row>(category === 'PAYMENT_SUPPORT' ? '/customer/invoices' : null, true, true);
  const rentals = useResource<Row>(category !== 'PAYMENT_SUPPORT' ? '/customer/rentals' : null, true, true);
  const operational = category !== 'OTHER' && category !== 'PAYMENT_SUPPORT';
  const billing = category === 'PAYMENT_SUPPORT';
  const active = rows(rentals.data?.items).flatMap(rental => rows(rental.contracts)
    .filter(contract => contract.status === 'ACTIVE' && text(contract, 'unit.id') && idOf(contract))
    .map(contract => ({ id: idOf(contract), rid: text(rental, 'reservationId') || idOf(rental), unitId: text(contract, 'unit.id'), title: text(rental, 'storageType.name') || 'Kho đang thuê', caption: text(contract, 'unit.unitCode') })));
  const chosenContract = !billing ? active.find(item => item.id === (contractId || (operational && active.length === 1 ? active[0].id : ''))) : undefined;
  const invoiceRows = rows(invoices.data?.items);
  const invoice = billing ? invoiceRows.find(item => idOf(item) === invoiceId) : undefined;
  const bookingsList = bookings.data ?? [];
  const resolvedBooking = (invoice && reservation(invoice)) || chosenContract?.rid || bookingId || (bookingsList.length === 1 ? idOf(bookingsList[0]) : '');
  const source = [...(billing ? [invoices] : operational || contractId ? [rentals] : []), ...(operational || params.invoiceId || invoice || chosenContract ? [] : [bookings])];
  const failed = source.find(item => item.error);
  const loading = source.some(item => item.loading);
  const noContext = !loading && !failed && (params.invoiceId ? !invoice : operational ? !active.length : !bookingsList.length && !invoiceRows.length && !chosenContract);
  const submit = async () => {
    if (lock.current || loading || failed) return;
    const next: Record<string, string> = {};
    if (subject.trim().length < 3) next.subject = 'Nhập tiêu đề có ít nhất 3 ký tự.';
    if (description.trim().length < 3) next.description = 'Mô tả vấn đề bằng ít nhất 3 ký tự.';
    if (subject.trim() === EARLY_RETURN_SUBJECT) next.subject = 'Dùng mục Trả kho để gửi đề nghị trả trước hạn.';
    if (operational && !chosenContract) next.context = 'Chọn kho đang thuê cần hỗ trợ.';
    if (invoiceId && billing && !invoice) next.context = 'Không tìm thấy hóa đơn đã chọn.';
    if (contractId && !billing && !chosenContract) next.context = 'Kho đã chọn hiện không còn phù hợp. Vui lòng chọn lại.';
    if (!resolvedBooking) next.context = 'Chọn đơn đặt kho hoặc hóa đơn liên quan.';
    setErrors(next);
    if (Object.keys(next).length) return;
    lock.current = true;
    setBusy(true);
    try {
      const item = await operationMutate(endpoint, 'POST', {
        reservationId: resolvedBooking, category, subject: subject.trim(), description: description.trim(),
        ...(invoice ? { invoiceId: idOf(invoice) } : {}),
        ...(chosenContract ? { rentalContractId: chosenContract.id, storageUnitId: chosenContract.unitId } : {}),
      }, true);
      router.replace((idOf(item) ? supportPath + '/' + encodeURIComponent(idOf(item)) : supportPath) as Href);
    } catch (error) {
      setErrors({ server: error instanceof Error ? error.message : 'Chưa gửi được yêu cầu. Vui lòng thử lại.' });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return <Page title="Tạo yêu cầu hỗ trợ">
    {params.invoiceId ? <View style={s.group}><Text style={s.label}>Loại hỗ trợ</Text><Text style={[s.fieldText, s.input]}>{categories.PAYMENT_SUPPORT}</Text></View> :
      <Picker title="Loại hỗ trợ" disabled={busy} value={category} options={Object.entries(categories).map(([id, title]) => ({ id, title }))}
        onSelect={id => { setCategory(id as Category); setErrors({}); }} />}
    {loading ? <LoadingState layout="compact" /> : null}
    {failed ? <ErrorState message={failed.error ?? ''} onRetry={failed.refresh} /> : null}
    {billing && params.invoiceId && invoice ? <View style={s.group}><Text style={s.label}>Hóa đơn liên quan</Text><Text style={[s.fieldText, s.input]}>{invoiceTitle(invoice)} · {text(invoice, 'invoiceCode')}</Text></View> : null}
    {billing && !params.invoiceId && invoiceRows.length ? <Picker title="Hóa đơn liên quan" disabled={busy} value={invoiceId}
      options={[{ id: '', title: 'Không chọn hóa đơn' }, ...invoiceRows.map(item => ({ id: idOf(item), title: invoiceTitle(item) + ' · ' + text(item, 'invoiceCode') }))]}
      onSelect={id => { setInvoice(id); setErrors({}); }} /> : null}
    {!billing && active.length ? <Picker title={operational ? 'Kho liên quan' : 'Kho liên quan (nếu có)'} disabled={busy} value={chosenContract?.id ?? ''}
      options={[...(operational ? [] : [{ id: '', title: 'Không chọn kho' }]), ...active]}
      onSelect={id => { setContract(id); setErrors({}); }} /> : null}
    {!billing && !operational && !loading && !failed && contractId && !chosenContract ? <Pressable accessibilityRole="button" onPress={() => setContract('')}>
      <Text style={s.muted}>Kho đã chọn không còn hoạt động. Bấm để bỏ liên kết kho.</Text>
    </Pressable> : null}
    {!operational && !invoice && !chosenContract && !params.invoiceId && bookingsList.length ? <Picker title="Đơn đặt kho liên quan" disabled={busy} value={resolvedBooking}
      options={bookingsList.map(item => ({ id: idOf(item), title: bookingName(item), caption: [text(item, 'reference', 'reservationCode'), text(item, 'createdAt') && formatDate(text(item, 'createdAt'))].filter(Boolean).join(' · ') }))}
      onSelect={id => { setBooking(id); setErrors({}); }} /> : null}
    {noContext ? <Text style={s.muted}>{params.invoiceId ? 'Không tìm thấy hóa đơn này.' : operational ? 'Loại hỗ trợ này cần kho đang thuê. Hãy chọn loại khác nếu bạn cần hỏi về đơn đặt.' : 'Biểu mẫu cần một đơn đặt kho hoặc hóa đơn của bạn. Bạn hiện chưa có hồ sơ để gửi yêu cầu.'}</Text> : null}
    {errors.context ? <Text accessibilityRole="alert" style={s.error}>{errors.context}</Text> : null}
    <View style={s.group}><Text style={s.label}>Tiêu đề *</Text>
      <TextInput accessibilityLabel="Tiêu đề" value={subject} onChangeText={setSubject} editable={!busy} maxLength={200} style={[s.fieldText, s.input]} placeholder="Bạn cần hỗ trợ gì?" />
      {errors.subject ? <Text style={s.error}>{errors.subject}</Text> : null}</View>
    <View style={s.group}><Text style={s.label}>Mô tả vấn đề *</Text>
      <TextInput accessibilityLabel="Mô tả vấn đề" value={description} onChangeText={setDescription} editable={!busy} maxLength={4000}
        multiline style={[s.fieldText, s.input, s.multiline]} placeholder="Mô tả để NestBox kiểm tra" />
      <Text style={[s.muted, { textAlign: 'right' }]}>{description.length}/4000</Text>
      {errors.description ? <Text style={s.error}>{errors.description}</Text> : null}</View>
    {errors.server ? <Text accessibilityRole="alert" style={s.error}>{errors.server}</Text> : null}
    <Action title={busy ? 'Đang gửi…' : 'Gửi yêu cầu'} onPress={submit} disabled={busy || loading || Boolean(failed) || noContext} />
  </Page>;
}

export function CustomerSupportDetail({ id }: { id: string }) {
  const source = useResource<Row>(endpoint + '/' + encodeURIComponent(id));
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const row = source.data;
  const resolved = row?.status === 'RESOLVED';
  const milestones = row ? [['Đã gửi', text(row, 'createdAt')], ['Bắt đầu xử lý', text(row, 'startedAt')], ['Đã giải quyết', resolved ? text(row, 'resolvedAt') : '']].filter(([, date]) => date) : [];
  return <Page title="Chi tiết hỗ trợ" refresh={{ busy: source.loading, run: source.refresh }}>
    {source.error ? <ErrorState message={source.error} onRetry={source.refresh} /> : !row ? <LoadingState layout="detail" /> : <>
      <View style={s.group}><Text style={s.title}>{text(row, 'subject')}</Text><Badge row={row} />
        {context(row) ? <Text style={s.label}>{context(row)}</Text> : null}
        <Text style={s.muted}>{[categoryName(row), formatDate(text(row, 'createdAt'))].filter(Boolean).join(' · ')}</Text>
      </View>
      <View style={[s.tint, s.group]}><Text style={s.label}>Nội dung yêu cầu</Text><Text selectable style={s.fieldText}>{text(row, 'description')}</Text></View>
      {resolved && text(row, 'resolutionNote') ? <View style={[s.tint, s.done, s.row]}><Check size={20} color={C.success} /><View style={s.grow}>
        <Text style={s.label}>Kết quả xử lý</Text><Text selectable style={s.fieldText}>{text(row, 'resolutionNote')}</Text>
      </View></View> : null}
      {milestones.length ? <View style={s.group}><Text style={s.label}>Cập nhật xử lý</Text>
        {milestones.map(([label, date]) => <View key={label} style={s.event}><View style={s.dot} /><View style={s.grow}>
          <Text style={s.label}>{label}</Text><Text style={s.muted}>{formatDate(date, true)}</Text></View></View>)}
      </View> : null}
      <View style={s.reference}><Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={[s.row, s.input, { borderWidth: 0 }]} onPress={() => setExpanded(!expanded)}>
        <Info size={17} color={C.cobalt} /><Text style={[s.label, s.grow]}>Thông tin tham chiếu</Text><ChevronDown size={17} color={C.muted} />
      </Pressable>
        {expanded ? <View style={[s.tint, s.group]}>
          {([['Mã yêu cầu', text(row, 'supportCode')], ['Mã đơn đặt kho', text(row, 'reservation.reference')], ['Hóa đơn', text(row, 'invoice.invoiceCode')], ['Cập nhật', text(row, 'updatedAt') && formatDate(text(row, 'updatedAt'), true)]])
            .filter(([, value]) => value).map(([key, value]) => <View key={key} style={s.row}>
              <Text selectable style={[s.muted, s.grow]}>{key} · {value}</Text>
              {key === 'Mã yêu cầu' ? <Pressable accessibilityRole="button" onPress={() => { Clipboard.setString(value); setCopied(true); }}>
                <Text style={s.label}>{copied ? 'Đã sao chép' : 'Sao chép'}</Text>
              </Pressable> : null}
            </View>)}
        </View> : null}
      </View>
    </>}
  </Page>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF' },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: 16, paddingBottom: 26, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  group: { gap: 6 },
  grow: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 21, fontWeight: '800', color: C.text },
  label: { fontSize: 14, fontWeight: '700', color: C.text },
  fieldText: { fontSize: 15, color: C.text, lineHeight: 21 },
  muted: { fontSize: 13, lineHeight: 18, color: C.muted },
  error: { color: '#B42318', fontSize: 13 },
  white: { color: 'white', fontSize: 14, fontWeight: '700' },
  button: { minHeight: 44, borderRadius: 11, backgroundColor: C.cobalt, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  tint: { backgroundColor: '#EEF2FC', padding: 12, borderRadius: 12 },
  icon: { width: 39, height: 39, borderRadius: 11, backgroundColor: '#E8F1FD', alignItems: 'center', justifyContent: 'center' },
  badge: { fontSize: 12, fontWeight: '700', color: '#854600', backgroundColor: '#FFF0CB', alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  done: { backgroundColor: '#E0F5E7', color: '#087334' },
  line: { paddingVertical: 11, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DCE3EF' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: '#DCE3EF', justifyContent: 'center', paddingHorizontal: 9 },
  selected: { backgroundColor: C.cobalt, borderColor: C.cobalt },
  input: { minHeight: 44, paddingHorizontal: 11, paddingVertical: 9, borderWidth: 1, borderColor: '#CFD8E7', borderRadius: 9 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#10182870' },
  sheet: { gap: 12, padding: 16, backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' },
  event: { flexDirection: 'row', gap: 12, paddingVertical: 5, alignItems: 'flex-start' },
  dot: { width: 9, height: 9, marginTop: 5, borderRadius: 5, backgroundColor: C.cobalt },
  reference: { borderRadius: 10, borderWidth: 1, borderColor: '#DCE3EF', overflow: 'hidden' },
});
