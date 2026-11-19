import { useCallback, useRef, useState } from 'react';
import { Alert, BackHandler, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Box, Calendar, Check, ChevronDown, ChevronRight, Headphones, Plus, Warehouse } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateField } from './date-field';
import { ItemPhotos } from './item-photos';
import { EmptyState, ErrorState, LoadingState } from './screen-state';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { idOf, object, rows, text, type Row } from '@/operations/model';
import { operationMutate } from '@/operations/mutate';
import { useResource } from '@/operations/use-resource';
import { formatDate, formatMoney } from '@/utils/format';
import { isCalendarDate, vietnamCalendarDate } from '@/utils/calendar-date';

const endpoint = '/customer/damage-claims';
const pagePath = '/customer/damage-claims' as const;
const states: Record<string, string> = {
  REPORTED: 'Chờ kiểm tra', INVESTIGATING: 'Đang xác minh', APPROVED: 'Đã chấp thuận',
  REJECTED: 'Chưa chấp thuận', RESOLVED: 'Đã có kết quả',
};
const events: Record<string, string> = {
  ASSIGNED: 'Đã phân công', INSPECTED: 'Đã kiểm tra', DECIDED: 'Đã có quyết định',
  NOTIFIED: 'Đã thông báo kết quả', RESOLVED: 'Đã hoàn tất', CASH_HANDED_OVER: 'Đã ghi nhận giao tiền',
  INVESTIGATING: 'Đang xác minh', APPROVED: 'Đã chấp thuận', REJECTED: 'Chưa chấp thuận',
  'amend-decision': 'Đã cập nhật quyết định', 'amend-resolution': 'Đã cập nhật kết quả',
};
const isDecided = (row: Row) => ['APPROVED', 'REJECTED', 'RESOLVED'].includes(text(row, 'status'));
const photosOf = (row: Row) => Array.isArray(row.evidencePhotos) ? row.evidencePhotos.filter((value): value is string => typeof value === 'string') : [];
function claimTitle(row: Row) {
  const firstLine = text(row, 'description').split(/[\n.!?]/)[0]?.trim();
  if (!firstLine) return 'Sự cố hàng hóa';
  return firstLine.length > 72 ? firstLine.slice(0, 69).trimEnd() + '…' : firstLine;
}
const toDetail = (id: string) => ({ pathname: '/customer/damage-claims/[id]' as const, params: { id } });

function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  return <Stack.Screen options={{ title, headerTitleAlign: 'center',
    headerTitleStyle: { color: C.navy, fontWeight: '700', fontSize: 19 },
    ...(onBack ? { headerLeft: () => <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" style={s.back} onPress={onBack}><ArrowLeft color={C.text} size={22} /></Pressable> } : {}),
  }} />;
}

function Action({ title, onPress, secondary = false, disabled = false, add = false }: {
  title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; add?: boolean;
}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={[s.action, secondary && s.outline, disabled && s.disabled]}>
    {add ? <Plus size={17} color={C.onHero} /> : null}
    <Text style={[s.buttonText, secondary && s.blue]}>{title}</Text>
  </Pressable>;
}

function Badge({ row }: { row: Row }) {
  return <Text style={[s.badge, isDecided(row) && s.resultBadge]}>{states[text(row, 'status')] ?? 'Đang theo dõi'}</Text>;
}

export function ClaimsList() {
  const { claim, create, rentalContractId } = useLocalSearchParams<{ claim?: string; create?: string; rentalContractId?: string }>();
  const [filter, setFilter] = useState(0);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const source = useResource<{ items: Row[] }>(claim || create === '1' ? null : endpoint, true);
  const filtered = (source.data?.items ?? []).filter(row => filter === 0 || isDecided(row) === (filter === 2));
  const shown = filtered.slice(0, page * 15);
  useFocusEffect(useCallback(() => {
    if (claim) router.replace(toDetail(claim));
    else if (create === '1') router.replace({ pathname: '/customer/damage-claims/new', params: rentalContractId ? { rentalContractId } : {} });
  }, [claim, create, rentalContractId]));
  if (claim || create === '1') return <LoadingState layout="compact" />;

  return <>
    <Header title="NestBox" />
    <ScrollView style={s.screen} contentContainerStyle={s.page}
      refreshControl={<RefreshControl refreshing={refreshing && source.loading} onRefresh={() => { setRefreshing(true); source.refresh(); }} />}>
      <View style={s.spread}>
        <View style={s.grow}><Text accessibilityRole="header" style={s.title}>Sự cố hàng hóa</Text><Text style={s.muted}>Theo dõi báo cáo của bạn</Text></View>
        <Action title="Báo sự cố" add onPress={() => router.push('/customer/damage-claims/new')} />
      </View>
      <View style={s.filters}>
        {['Tất cả', 'Đang xử lý', 'Đã có kết quả'].map((title, index) => <Pressable key={title} accessibilityRole="tab"
          accessibilityState={{ selected: index === filter }} style={[s.filter, index === filter && s.selected]} onPress={() => { setFilter(index); setPage(1); }}>
          <Text style={[s.filterText, index === filter && s.white]}>{title}</Text>
        </Pressable>)}
      </View>
      {source.loading ? <LoadingState layout="compact" /> : source.error ? <ErrorState message={source.error} onRetry={source.refresh} />
        : shown.length ? shown.map(row => <Pressable key={idOf(row)} accessibilityRole="button" style={[s.card, s.spread]}
          onPress={() => router.push(toDetail(idOf(row)))}>
          <View style={s.icon}><Box size={22} color={C.navy} /></View>
          <View style={s.grow}>
            <View style={s.spread}><Text numberOfLines={1} style={[s.heading, s.grow]}>{claimTitle(row)}</Text><Badge row={row} /></View>
            <View style={s.metadata}><Warehouse size={13} color={C.navy} /><Text style={s.small}>{text(row, 'unitCodeSnapshot')}</Text>
              <Calendar size={13} color={C.navy} /><Text style={s.small}>Gửi {formatDate(text(row, 'createdAt'))}</Text></View>
            <Text numberOfLines={2} style={s.muted}>{text(row, 'description')}</Text>
          </View>
          <ChevronRight size={16} color={C.muted} />
        </Pressable>) : <EmptyState title="Chưa có báo cáo phù hợp" message={filter ? 'Bạn có thể chọn bộ lọc khác.' : 'Báo cáo đã gửi sẽ xuất hiện tại đây.'} />}
      {shown.length < filtered.length ? <Action secondary title="Xem thêm" onPress={() => setPage(value => value + 1)} /> : null}
    </ScrollView>
  </>;
}

export function ClaimForm() {
  const { rentalContractId } = useLocalSearchParams<{ rentalContractId?: string }>();
  const [chosenId, setChosenId] = useState(rentalContractId ?? '');
  const [picker, setPicker] = useState<'unit' | 'items'>();
  const [date, setDate] = useState(() => vietnamCalendarDate());
  const [description, setDescription] = useState('');
  const [estimate, setEstimate] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [review, setReview] = useState(false);
  const [error, setError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unconfirmedId, setUnconfirmedId] = useState('');
  const lock = useRef(false);
  const rentals = useResource<{ items: Row[] }>('/customer/rentals', true);
  const choices = (rentals.data?.items ?? []).flatMap(rental => rows(rental.contracts)
    .filter(contract => contract.status === 'ACTIVE' && idOf(contract) && text(contract, 'unit.id'))
    .map(contract => ({ id: idOf(contract), name: text(rental, 'storageType.name') || text(contract, 'unit.unitCode'),
      code: text(contract, 'unit.unitCode'), zone: text(contract, 'unit.zone'), floor: text(contract, 'unit.floor')
        .replace(/^ground(?: floor)?$/i, 'Tầng trệt').replace(/^(?:floor\s+)?(\d+)$/i, 'Tầng $1') })));
  const storage = chosenId ? choices.find(item => item.id === chosenId) : choices[0];
  const inventory = useResource<Row[]>(storage ? '/customer/stored-items?rentalContractId=' + encodeURIComponent(storage.id) : null);
  const items = rows(inventory.data);
  const affected = items.filter(item => itemIds.includes(idOf(item))).map(item => text(item, 'name')).join(', ');
  const amount = estimate.trim() ? Number(estimate) : null;
  const back = useCallback(() => {
    if (lock.current) return;
    if (review) { setReview(false); setError(''); }
    else if (router.canGoBack()) router.back();
    else router.replace(pagePath);
  }, [review]);
  useFocusEffect(useCallback(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!review && !lock.current) return false;
      back();
      return true;
    });
    return () => listener.remove();
  }, [back, review]));

  function validate() {
    const issue = !storage ? 'Chọn kho đang thuê.' : !isCalendarDate(date) || date > vietnamCalendarDate() ? 'Ngày phát hiện phải hợp lệ và không sau hôm nay.'
      : itemIds.some(id => !items.some(item => idOf(item) === id)) ? 'Kiểm tra lại các mặt hàng đã chọn.'
      : description.trim().length < 10 ? 'Mô tả sự cố cần ít nhất 10 ký tự.'
      : amount !== null && (!/^\d+$/.test(estimate.trim()) || !Number.isSafeInteger(amount)) ? 'Nhập giá trị ước tính bằng số nguyên không âm.'
      : !photos.length ? 'Thêm ít nhất một ảnh chứng cứ.' : '';
    setError(issue);
    return !issue;
  }

  async function send() {
    if (lock.current || unconfirmedId || !review || !validate() || !storage) return;
    lock.current = true;
    setBusy(true);
    try {
      const saved = await operationMutate(endpoint, 'POST', {
        rentalContractId: storage.id, discoveredOn: date, description: description.trim(), estimatedValue: amount,
        storedItemIds: itemIds, evidencePhotos: photos,
      }, true);
      const id = idOf(saved);
      if (!id) throw new Error('Chưa xác nhận được báo cáo từ máy chủ.');
      if (photosOf(saved).length !== photos.length) {
        setUnconfirmedId(id);
        setError('Báo cáo đã được tạo nhưng máy chủ chưa xác nhận lưu ảnh. Vui lòng liên hệ nhân viên với mã ' + text(saved, 'claimCode') + '.');
        return;
      }
      router.replace(toDetail(id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa gửi được báo cáo. Vui lòng thử lại.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Header title={review ? 'Kiểm tra sự cố' : 'Báo cáo mới'} onBack={back} />
    <ScrollView key={review ? 'review' : 'form'} keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
      {review ? <>
        <View style={[s.banner, s.spread]}><Check size={22} color={C.navy} /><View style={s.grow}>
          <Text style={[s.heading, s.blue]}>Sẵn sàng gửi</Text><Text style={s.muted}>Kiểm tra lại thông tin trước khi gửi.</Text></View></View>
        <View style={s.card}>
          <Fact title="Kho" value={storage?.name} /><Fact title="Ngày phát hiện" value={formatDate(date)} />
          <Fact title="Hàng bị ảnh hưởng" value={affected} /><Fact title="Mô tả sự cố" value={description.trim()} />
        </View>
        <Evidence photos={photos} />
        {amount !== null ? <View style={s.card}><Fact title="Giá trị ước tính" value={formatMoney(amount)} /></View> : null}
        {amount !== null ? <Text style={s.warning}>Giá trị ước tính không phải số tiền bồi thường được duyệt.</Text> : null}
      </> : <>
        {rentals.loading ? <LoadingState layout="compact" /> : rentals.error ? <ErrorState message={rentals.error} onRetry={rentals.refresh} />
          : choices.length ? <Pressable accessibilityRole="button" style={[s.banner, s.spread]} onPress={() => setPicker('unit')}>
            <Warehouse size={26} color={C.navy} /><View style={s.grow}><Text style={s.heading}>{storage?.name || 'Chọn kho đang thuê'}</Text>
              {storage ? <Text style={s.muted}>{[storage.code, storage.floor, storage.zone && 'Khu ' + storage.zone].filter(Boolean).join(' · ')}</Text> : null}
            </View>{storage ? <Text style={s.resultBadge}>Đang hoạt động</Text> : null}<ChevronDown size={16} color={C.muted} />
          </Pressable> : <EmptyState title="Bạn chưa có kho đang thuê" message="Bạn có thể báo sự cố sau khi nhận kho." />}
        <DateField title="Ngày phát hiện *" value={date} onChange={setDate} />
        <View style={s.field}><Text style={s.heading}>Hàng bị ảnh hưởng</Text>
          <Pressable accessibilityRole="button" disabled={!storage || inventory.loading || !items.length} style={[s.input, s.spread]} onPress={() => setPicker('items')}>
            <Box size={17} color={C.muted} /><Text numberOfLines={2} style={[s.body, s.grow]}>{affected || (inventory.loading ? 'Đang tải hàng…' : items.length ? 'Chọn hàng đang lưu' : 'Chưa có hàng để chọn')}</Text><ChevronRight size={15} color={C.muted} />
          </Pressable>
          {inventory.error ? <ErrorState message={inventory.error} onRetry={inventory.refresh} /> : null}
          {!items.length && !inventory.loading ? <Text style={s.small}>Bạn có thể ghi tên hàng trong phần mô tả.</Text> : null}
        </View>
        <View style={s.field}><Text style={s.heading}>Mô tả sự cố *</Text>
          <TextInput accessibilityLabel="Mô tả sự cố" multiline maxLength={3000} value={description} onChangeText={setDescription}
            style={[s.input, s.description]} placeholder="Mô tả tình trạng bạn phát hiện" placeholderTextColor={C.muted} />
          <Text style={[s.small, s.counter]}>{description.length}/3000</Text>
        </View>
        <View style={s.field}><Text style={s.heading}>Giá trị ước tính (tùy chọn)</Text>
          <TextInput accessibilityLabel="Giá trị ước tính" inputMode="numeric" maxLength={16} value={estimate} onChangeText={setEstimate} style={s.input} placeholder="Số tiền (đ)" placeholderTextColor={C.muted} /></View>
        <View style={s.spread}><Text style={s.heading}>Ảnh chứng cứ *</Text><Text style={s.small}>{photos.length} / 3</Text></View>
        <ItemPhotos photos={photos} editable onChange={setPhotos} onBusyChange={setPhotoBusy} />
      </>}
    </ScrollView>
    <View style={s.footer}>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <View style={s.spread}>
        {unconfirmedId ? <View style={s.grow}><Action title="Xem báo cáo đã tạo" onPress={() => router.replace(toDetail(unconfirmedId))} /></View> : review ? <>
          <View style={s.grow}><Action disabled={busy} title="Chỉnh sửa" secondary onPress={back} /></View>
          <View style={s.grow}><Action disabled={busy} title={busy ? 'Đang gửi…' : 'Gửi báo cáo'} onPress={() => void send()} /></View>
        </> : <View style={s.grow}><Action disabled={photoBusy || !storage} title="Kiểm tra báo cáo" onPress={() => { if (validate()) setReview(true); }} /></View>}
      </View>
    </View>
    <Modal visible={Boolean(picker)} transparent animationType="slide" onRequestClose={() => setPicker(undefined)}>
      <View style={s.scrim}><SafeAreaView edges={['bottom']} style={s.sheet}>
        <Text style={s.title}>{picker === 'unit' ? 'Chọn kho' : 'Hàng bị ảnh hưởng'}</Text>
        <ScrollView style={s.options}>{picker === 'unit' ? choices.map(item => <Option key={item.id} label={[item.name, item.code].filter(Boolean).join(' · ')}
          selected={item.id === storage?.id} onPress={() => { if (item.id !== storage?.id) setItemIds([]); setChosenId(item.id); setPicker(undefined); }} />)
          : items.map(item => <Option key={idOf(item)} label={text(item, 'name')} selected={itemIds.includes(idOf(item))}
            onPress={() => setItemIds(current => current.includes(idOf(item)) ? current.filter(id => id !== idOf(item)) : [...current, idOf(item)])} />)}</ScrollView>
        <Action title="Xong" onPress={() => setPicker(undefined)} />
      </SafeAreaView></View>
    </Modal>
  </KeyboardAvoidingView>;
}

function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[s.spread, s.option]}>
    <Text style={[s.body, s.grow]}>{label}</Text>{selected ? <Check size={18} color={C.navy} /> : null}
  </Pressable>;
}

function Fact({ title, value }: { title: string; value?: string }) {
  return value ? <View style={s.fact}><Text style={s.muted}>{title}</Text><Text selectable style={[s.body, s.factValue]}>{value}</Text></View> : null;
}

function Evidence({ photos }: { photos: string[] }) {
  return photos.length ? <View style={s.field}><Text style={s.heading}>Ảnh chứng cứ ({photos.length})</Text><ItemPhotos photos={photos} /></View> : null;
}

export function ClaimDetail() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const source = useResource<Row>(id ? endpoint + '/' + encodeURIComponent(id) : null);
  const claim = source.data;
  return <>
    <Header title="Chi tiết sự cố" />
    <ScrollView style={s.screen} contentContainerStyle={s.page}>
      {source.loading ? <LoadingState layout="detail" /> : source.error ? <ErrorState message={source.error} onRetry={source.refresh} />
        : claim ? <ClaimContent claim={claim} /> : <EmptyState title="Chưa tìm thấy báo cáo" message="Quay lại danh sách để chọn báo cáo." />}
    </ScrollView>
  </>;
}

function ClaimContent({ claim }: { claim: Row }) {
  const history = rows(claim.history).filter(event => text(event, 'at') && events[text(event, 'action')]);
  const payment = object(claim.compensation);
  const paid = text(payment, 'handedOverAt') && typeof payment.paidCompensationAmount === 'number';
  const approved = typeof payment.approvedCompensationAmount === 'number' ? formatMoney(payment.approvedCompensationAmount) : undefined;
  const links = Array.isArray(claim.evidenceLinks) ? claim.evidenceLinks.filter((link): link is string => typeof link === 'string' && link.startsWith('https://')) : [];
  const timeline = [
    ...(text(claim, 'createdAt') ? [{ title: 'Đã gửi', at: text(claim, 'createdAt') }] : []),
    ...history.map(event => ({ title: events[text(event, 'action')], at: text(event, 'at') })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const reference = text(claim, 'claimCode');
  return <>
    <View style={s.spread}><View style={s.icon}><Box size={22} color={C.navy} /></View>
      <View style={s.grow}><Text style={s.heading}>{claimTitle(claim)}</Text><Text style={s.small}>{text(claim, 'unitCodeSnapshot')} · Gửi {formatDate(text(claim, 'createdAt'))}</Text></View><Badge row={claim} /></View>
    <View style={s.card}>
      <Fact title="Ngày phát hiện" value={formatDate(text(claim, 'discoveredOn'))} />
      <Fact title="Hàng bị ảnh hưởng" value={rows(claim.affectedItems).map(item => text(item, 'name')).filter(Boolean).join(', ')} />
      <Fact title="Mô tả sự cố" value={text(claim, 'description')} />
      <Fact title="Giá trị khách ước tính" value={typeof claim.estimatedValue === 'number' ? formatMoney(claim.estimatedValue) : undefined} />
      <Fact title="Mã báo cáo" value={reference} />
    </View>
    {isDecided(claim) || text(claim, 'staffFacts') ? <View style={s.field}><Text style={s.heading}>Kết quả xử lý</Text>
      <View style={s.banner}>
        <Text style={s.heading}>{states[text(claim, 'status')]}</Text>
        <Fact title="Ghi nhận tại kho" value={text(claim, 'staffFacts')} />
        <Fact title="Lý do quyết định" value={text(claim, 'decisionReason')} />
        <Fact title="Kết quả" value={text(claim, 'resolutionNote')} />
        <Fact title="Bồi thường được duyệt" value={approved} />
        {paid ? <Fact title="Tiền đã giao" value={formatMoney(Number(payment.paidCompensationAmount)) + ' · ' + formatDate(text(payment, 'handedOverAt'))} /> : null}
      </View></View> : null}
    <Evidence photos={photosOf(claim)} />
    {links.map((link, index) => <Pressable accessibilityRole="link" key={link + index} style={s.option} onPress={() => void Linking.openURL(link).catch(() => Alert.alert('Không mở được liên kết chứng cứ'))}>
      <Text style={s.blue}>Mở chứng cứ {index + 1}</Text></Pressable>)}
    {timeline.length ? <View style={s.field}><Text style={s.heading}>Lịch sử xử lý</Text>
      {timeline.map(({ title, at }, index) => <View key={at + index} style={s.timeline}>
        <View style={s.dot}><Check size={12} color={C.onHero} /></View><View style={s.grow}><Text style={s.heading}>{title}</Text><Text style={s.small}>{formatDate(at, true)}</Text></View>
      </View>)}</View> : null}
    <Pressable accessibilityRole="button" style={[s.banner, s.spread]} onPress={() => router.push('/customer/support-requests')}>
      <Headphones size={19} color={C.navy} /><Text style={[s.body, s.grow]}>Cần hỗ trợ thêm về sự cố này?</Text><ChevronRight size={16} color={C.muted} />
    </Pressable>
  </>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surface },
  page: { padding: 16, paddingBottom: 24, gap: 12, width: '100%', maxWidth: 620, alignSelf: 'center' },
  footer: { padding: 12, paddingHorizontal: 16, gap: 7, width: '100%', maxWidth: 620, alignSelf: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.divider, backgroundColor: C.surface },
  grow: { flex: 1, minWidth: 0 },
  spread: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  title: { fontSize: 23, fontWeight: '800', color: C.text },
  heading: { fontSize: 14, fontWeight: '700', color: C.text },
  body: { fontSize: 14, lineHeight: 20, color: C.text },
  muted: { fontSize: 13, lineHeight: 19, color: C.muted },
  small: { fontSize: 12, color: C.muted },
  blue: { color: C.navy },
  white: { color: C.onHero },
  filters: { flexDirection: 'row', gap: 6, marginVertical: 4 },
  filter: { flex: 1, minHeight: 42, backgroundColor: C.soft, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterText: { textAlign: 'center', fontSize: 12, color: C.text, fontWeight: '600' },
  selected: { backgroundColor: C.navy },
  action: { backgroundColor: C.navy, borderWidth: 1, borderColor: C.navy, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, borderRadius: 11, paddingHorizontal: 10 },
  outline: { backgroundColor: C.surface },
  buttonText: { fontSize: 13, fontWeight: '700', color: C.onHero, textAlign: 'center' },
  disabled: { opacity: 0.5 },
  card: { borderColor: C.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, padding: 10, gap: 8 },
  icon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.tealSubtle },
  metadata: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginVertical: 4 },
  badge: { fontSize: 11, fontWeight: '700', borderRadius: 14, paddingHorizontal: 7, paddingVertical: 4, color: C.warning, backgroundColor: C.warningBackground, overflow: 'hidden' },
  resultBadge: { fontSize: 11, fontWeight: '700', color: C.success, backgroundColor: C.successBackground, borderRadius: 14, paddingHorizontal: 7, paddingVertical: 4, overflow: 'hidden' },
  banner: { backgroundColor: C.tealSubtle, borderRadius: 12, padding: 12, gap: 8 },
  input: { minHeight: 44, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10, color: C.text },
  description: { minHeight: 82, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end' },
  field: { gap: 5 },
  fact: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 6, borderBottomColor: C.divider, borderBottomWidth: StyleSheet.hairlineWidth },
  factValue: { flex: 1, minWidth: 110, fontWeight: '600' },
  warning: { backgroundColor: C.warningBackground, color: C.warning, borderRadius: 10, padding: 10, lineHeight: 19 },
  error: { color: C.danger, fontSize: 13 },
  timeline: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5, gap: 9 },
  dot: { width: 21, height: 21, borderRadius: 11, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' },
  back: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  scrim: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  sheet: { maxHeight: '75%', backgroundColor: C.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, gap: 10 },
  options: { flexGrow: 0 },
  option: { minHeight: 44, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
});
