import { useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { CalendarDays, Check, ChevronRight, Headphones, Info, Warehouse } from 'lucide-react-native';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { CustomerActionRow, customerStyles as s } from '@/components/customer-premium';
import { Button } from '@/operations/ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { useResource } from '@/operations/use-resource';
import { operationMutate } from '@/operations/mutate';
import { idOf, object, rows, text, type Row } from '@/operations/model';
import { customerRentalActions } from '@/portals/actions';
import { EARLY_RETURN_SUBJECT, isEarlyReturnRequest, isCurrentEarlyReturnApproval } from '@/utils/early-return';
import { isTransferRequest } from '@/utils/transfer-request';
import { formatDate, formatMoney } from '@/utils/format';
import { vietnamCalendarDate } from '@/utils/calendar-date';

type Kind = 'transfers' | 'early-returns';
const support = '/customer/support-requests';
export function rentalChangePath(kind: Kind, contractId?: string) {
  return '/customer/' + kind + (contractId ? '/new?rentalContractId=' + encodeURIComponent(contractId) : '');
}

function progress(row: Row, early: boolean): string {
  if (early) {
    if (row.earlyReturnDecision === 'APPROVED') return 'Đã chấp thuận';
    if (row.earlyReturnDecision === 'REJECTED') return 'Đã từ chối';
  } else {
    const transfer = rows(row.transfers)[0];
    if (transfer?.status === 'COMPLETED') return 'Đã chuyển kho';
    if (transfer?.status === 'APPROVED') return 'Đã duyệt · Chờ chuyển kho';
    if (transfer?.status === 'REJECTED') return 'Đã từ chối';
    if (transfer?.status === 'REQUESTED') return 'Chờ xác nhận kho mới';
  }
  if (row.status === 'RESOLVED') return 'Đã có phản hồi';
  return row.status === 'OPEN' ? 'Đã gửi' : 'Đang xem xét';
}

export function CustomerRentalChange({ kind, id }: { kind: Kind; id?: string }) {
  const { rentalContractId } = useLocalSearchParams<{ rentalContractId?: string }>();
  const early = kind === 'early-returns';
  const creating = id === 'new';
  const base = rentalChangePath(kind);
  const title = early ? 'Trả kho trước hạn' : 'Chuyển kho';
  const matches = (row: Row) => early ? isEarlyReturnRequest(row) : !isEarlyReturnRequest(row) && isTransferRequest(row);
  const rentals = useResource<Row>(creating ? '/customer/rentals' : null, true, true);
  const requests = useResource<Row>(!id || creating ? support : null, true, true);
  const returns = useResource<Row>(creating ? '/customer/returns' : null, true, true);
  const detail = useResource<Row>(id && !creating ? support + '/' + encodeURIComponent(id) : null, false, true);
  const [selectedId, select] = useState(rentalContractId ?? '');
  const [form, showForm] = useState(false);
  const [reason, setReason] = useState('');
  const [preference, setPreference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const tickets = rows(requests.data?.items);
  const choices = rows(rentals.data?.items).flatMap(rental => {
    const reservationId = text(rental, 'reservationId');
    const contracts = rows(rental.contracts);
    const active = contracts.filter(contract => contract.status === 'ACTIVE' && text(contract, 'unit.status') === 'OCCUPIED' && text(contract, 'unit.id') && idOf(contract));
    if (!reservationId || !active.length) return [];
    if (early && (active.length !== Number(rental.quantity) || active.length !== contracts.length ||
      new Set(active.map(contract => text(contract, 'endDate'))).size !== 1 ||
      text(rental, 'effectiveEndDate').slice(0, 10) <= vietnamCalendarDate(Date.now()))) return [];
    const related = tickets.filter(ticket => text(ticket, 'reservation.id') === reservationId);
    const dimensions = ['lengthCm', 'widthCm', 'heightCm'].map(field => Number(text(rental, 'storageType.' + field)));
    const size = dimensions.every(value => value > 0) ? dimensions.map(value => (value / 100).toLocaleString('vi-VN')).join(' × ') + ' m' : '';
    const activeReturn = rows(returns.data?.items).some(item => text(item, 'reservation.id') === reservationId && item.status !== 'COMPLETED');
    return (early ? [active.find(contract => idOf(contract) === rentalContractId) ?? active[0]] : active).map(contract => {
      const contractId = idOf(contract);
      const unitId = text(contract, 'unit.id');
      const pending = related.find(ticket => !isEarlyReturnRequest(ticket) && isTransferRequest(ticket) &&
        (early || text(ticket, 'contract.id') === contractId || text(ticket, 'unit.id') === unitId ||
          (!text(ticket, 'contract.id') && !text(ticket, 'unit.id')) ||
          rows(ticket.transfers).some(item => text(item, 'contractId') === contractId)) &&
        (ticket.status !== 'RESOLVED' || rows(ticket.transfers).some(item => ['REQUESTED', 'APPROVED'].includes(text(item, 'status')))));
      const proposal = related.find(ticket => isEarlyReturnRequest(ticket) &&
        (ticket.status !== 'RESOLVED' || isCurrentEarlyReturnApproval(ticket, text(rental, 'effectiveEndDate'))));
      const earlyAction = early && customerRentalActions(rental, rows(returns.data?.items), Date.now(), tickets)
        .some(action => action.title === 'Đề nghị trả trước hạn');
      return {
        contractId, unitId, reservationId,
        name: text(rental, 'storageType.name') || 'Kho đang thuê',
        caption: early && active.length > 1 ? active.map(item => text(item, 'unit.unitCode')).join(' · ') :
          [text(contract, 'unit.unitCode'), text(contract, 'unit.zone') && 'Khu ' + text(contract, 'unit.zone'), size].filter(Boolean).join(' · '),
        end: text(contract, 'endDate'),
        debt: text(rental, 'returnReadiness.totalOutstanding'),
        count: early ? active.length : 1,
        blocked: early ? !earlyAction || Boolean(pending) : Boolean(pending || proposal || activeReturn),
        blockReason: activeReturn ? 'Đang xử lý yêu cầu trả kho' : rental.pendingRenewal && early ? 'Đang xử lý gia hạn' :
          early && pending ? 'Đang xử lý yêu cầu chuyển kho' : !early && proposal ? 'Đang có đề nghị trả trước hạn' : 'Chưa thể gửi yêu cầu mới',
        ticket: early ? proposal : pending,
      };
    });
  });
  const selected = choices.find(item => item.contractId === selectedId) ??
    (!selectedId && early && choices.length === 1 ? choices[0] : undefined);
  const sources = creating ? [rentals, requests, returns] : id ? [detail] : [requests];
  const loading = sources.some(source => source.loading);
  const issue = sources.find(source => source.error)?.error;
  const refresh = () => sources.forEach(source => source.refresh());
  const open = (requestId: string, replace = false) => {
    const target = (base + '/' + encodeURIComponent(requestId)) as Href;
    if (replace) router.replace(target);
    else router.push(target);
  };
  async function submit() {
    if (sending.current || !selected || selected.blocked || loading || issue) return;
    if (reason.trim().length < 3) {
      setError('Nhập lý do ít nhất 3 ký tự.');
      return;
    }
    setError('');
    sending.current = true;
    setBusy(true);
    try {
      const result = await operationMutate(support, 'POST', {
        reservationId: selected.reservationId,
        category: early ? 'OTHER' : 'UNIT_ISSUE',
        subject: early ? EARLY_RETURN_SUBJECT : 'Yêu cầu chuyển kho',
        description: [reason.trim(), !early && preference.trim() && 'Kho mong muốn: ' + preference.trim(), !early && notes.trim()].filter(Boolean).join('\n\n'),
        ...(!early ? { rentalContractId: selected.contractId, storageUnitId: selected.unitId } : {}),
      }, true);
      const requestId = idOf(result) || text(result, 'supportCode');
      if (requestId) open(requestId, true);
      else router.replace(base as Href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chưa gửi được yêu cầu. Vui lòng thử lại.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const showFields = early || form;
  const record = detail.data;
  const validRecord = record && matches(record);
  const currentTransfer = !early && record && validRecord ? rows(record.transfers)[0] ?? {} : {};
  const previous = tickets.filter(matches);
  return <>
    <Stack.Screen options={{ title: id && !creating ? 'Chi tiết yêu cầu' : form ? 'Yêu cầu chuyển kho' : title,
      headerTitleAlign: 'center', headerTitleStyle: { color: C.cobalt, fontSize: 19, fontWeight: '700' } }} />
    <ScrollView style={styles.screen} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}>
      {issue ? <ErrorState message={issue} onRetry={refresh} /> : loading ? <LoadingState layout="compact" /> : creating ? <>
        {!showFields ? <><Text style={s.section}>Chọn kho muốn chuyển</Text><Text style={s.secondary}>Chọn một ô kho đang thuê để gửi yêu cầu.</Text></> : null}
        {early ? <Text style={s.body}>Kho muốn trả</Text> : null}
        {form && selected ? <Pressable accessibilityRole="button" disabled={busy} style={[styles.card, styles.selected]} onPress={() => showForm(false)}>
          <Warehouse size={21} color={C.cobalt} /><View style={styles.grow}><Text style={s.body}>{selected.name}</Text>
            <Text style={s.secondary}>{selected.caption}</Text></View><ChevronRight size={18} color={C.cobalt} />
        </Pressable> : choices.map(item => <Pressable key={item.contractId} accessibilityRole="radio"
          accessibilityState={{ selected: selected?.contractId === item.contractId, disabled: item.blocked && !item.ticket }}
          disabled={busy || (item.blocked && !item.ticket)} onPress={() => { if (item.ticket) open(idOf(item.ticket)); else { select(item.contractId); setError(''); } }}
          style={[styles.card, selected?.contractId === item.contractId && styles.selected]}>
          <View style={styles.mark}>{selected?.contractId === item.contractId ? <Check size={15} color={C.cobalt} /> : null}</View>
          <View style={styles.icon}><Warehouse size={20} color={C.cobalt} /></View>
          <View style={styles.grow}><Text style={s.body}>{item.name}{item.count > 1 ? ' · ' + item.count + ' ô kho' : ''}</Text>
            <Text style={s.secondary}>{item.caption}</Text>
            <Text style={[styles.badge, item.blocked && styles.waiting]}>{item.ticket ? progress(item.ticket, early) : item.blocked ? item.blockReason : 'Đang hoạt động'}</Text>
          </View>
        </Pressable>)}
        {!choices.length ? <EmptyState title="Chưa có kho phù hợp" message="Bạn có thể xem lại các yêu cầu đã gửi." /> : null}
        {!showFields ? <Button title="Tiếp tục" disabled={!selected || selected.blocked} onPress={() => showForm(true)} /> : selected && !selected.blocked ? <>
          {early ? <>
            <View style={styles.card}><CalendarDays color={C.cobalt} size={19} /><Text style={[s.body, styles.grow]}>Hạn thuê hiện tại</Text><Text style={s.body}>{formatDate(selected.end)}</Text></View>
            <View style={styles.notice}><Info color={C.cobalt} size={18} /><View style={styles.grow}>
              <Text style={s.secondary}>{selected.debt && Number.isFinite(Number(selected.debt)) ? 'Còn phải trả theo hợp đồng: ' + formatMoney(Number(selected.debt)) + '. ' : ''}
                Cần thanh toán đủ các khoản đã cam kết, kể cả kỳ chưa đến hạn, trước khi gửi yêu cầu trả kho chính thức. Tiền cọc được quyết toán riêng.</Text>
              <CustomerActionRow title="Xem công nợ" path="/customer/invoices" />
            </View></View>
          </> : <Input label="Kho mong muốn (tùy chọn)" value={preference} onChange={setPreference} maxLength={160} disabled={busy} placeholder="Kích thước hoặc khu vực mong muốn" />}
          <Input label={early ? 'Lý do trả kho trước hạn *' : 'Lý do chuyển kho *'} value={reason}
            onChange={value => { setReason(value); setError(''); }} maxLength={early ? 3000 : 200} disabled={busy} multiline={early} />
          {!early ? <Input label="Mô tả nhu cầu (tùy chọn)" value={notes} onChange={setNotes} maxLength={500} disabled={busy} multiline /> : null}
          <View style={[styles.notice, !early && styles.waiting]}><Info color={early ? C.cobalt : '#9A5108'} size={18} />
            <Text style={[s.secondary, styles.grow]}>{early ? 'NestBox sẽ xem xét đề nghị. Bạn vẫn thuê kho cho đến khi hoàn tất trả kho.' : 'Chỉ chuyển hàng sau khi NestBox xác nhận kho mới.'}</Text>
          </View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button title={busy ? 'Đang gửi…' : early ? 'Gửi đề nghị' : 'Gửi yêu cầu chuyển kho'} disabled={busy} onPress={() => void submit()} />
        </> : null}
        {early ? <CustomerActionRow title="Xem yêu cầu đã gửi" path={base} /> : null}
      </> : id ? validRecord && record ? <>
        <View style={[styles.card, styles.selected]}><Warehouse color={C.cobalt} size={22} /><View style={styles.grow}>
          <Text style={s.body}>{text(record, 'unit.storageType.name') || text(currentTransfer, 'fromUnit.unitCode') || text(record, 'unit.unitCode') || title}</Text>
          <Text style={s.secondary}>{[text(currentTransfer, 'fromUnit.unitCode') || text(record, 'unit.unitCode', 'reservation.reference'), 'Đã gửi ' + formatDate(text(record, 'createdAt'))].filter(Boolean).join(' · ')}</Text>
        </View></View>
        <View style={styles.notice}><Info color={C.cobalt} size={18} /><View style={styles.grow}>
          <Text style={s.body}>{progress(record, early)}</Text>
          {text(currentTransfer, 'completedAt', 'approvedAt') || text(record, 'resolvedAt', 'startedAt') ? <Text style={s.secondary}>
            Cập nhật {formatDate(text(currentTransfer, 'completedAt', 'approvedAt') || text(record, 'resolvedAt', 'startedAt'), true)}
          </Text> : null}
          {text(currentTransfer, 'toUnit.unitCode') ? <Text style={s.secondary}>Kho mới · {text(currentTransfer, 'toUnit.unitCode')}</Text> : null}
          {early && record.earlyReturnDecision === 'APPROVED' ? <Text style={s.secondary}>Bạn có thể gửi yêu cầu trả kho khi đã thanh toán đủ và đủ điều kiện giao lại kho.</Text> : null}
        </View></View>
        <Text style={s.section}>Nội dung đã gửi</Text><Text style={s.body}>{text(record, 'description')}</Text>
        {text(record, 'resolutionNote') || text(currentTransfer, 'rejectionReason') ? <View style={styles.notice}><View style={styles.grow}>
          <Text style={s.body}>Phản hồi của NestBox</Text><Text style={s.secondary}>{text(currentTransfer, 'rejectionReason') || text(record, 'resolutionNote')}</Text>
        </View></View> : null}
        {early && record.earlyReturnDecision === 'APPROVED' && text(record, 'reservation.id') ? <CustomerActionRow title="Xem điều kiện và gửi yêu cầu trả kho"
          path={'/customer/returns/new?approvedEarlyReturn=1&reservationId=' + encodeURIComponent(text(record, 'reservation.id'))} /> : null}
        <CustomerActionRow title="Cần hỗ trợ?" icon={Headphones} path={'/customer/support-requests/new?reservationId=' + encodeURIComponent(text(record, 'reservation.id'))} />
      </> : <EmptyState title="Không tìm thấy yêu cầu" message="Kiểm tra lại trong danh sách yêu cầu đã gửi." /> : <>
        <Button title={early ? 'Gửi đề nghị mới' : 'Chọn kho muốn chuyển'} onPress={() => router.push((base + '/new') as Href)} />
        <Text style={s.section}>Yêu cầu đã gửi</Text>
        {previous.length ? previous.map(item => <Pressable key={idOf(item)} accessibilityRole="button" style={styles.card} onPress={() => open(idOf(item))}>
          <View style={styles.icon}><Warehouse size={19} color={C.cobalt} /></View>
          <View style={styles.grow}><Text style={s.body}>{text(object(rows(item.transfers)[0]), 'fromUnit.unitCode') || text(item, 'unit.unitCode') || title}</Text>
            <Text style={s.secondary}>{formatDate(text(item, 'createdAt'))}</Text><Text style={styles.status}>{progress(item, early)}</Text>
          </View><ChevronRight size={17} color={C.muted} />
        </Pressable>) : <EmptyState title="Chưa có yêu cầu" message="Yêu cầu đã gửi sẽ hiển thị tại đây." />}
      </>}
    </ScrollView>
  </>;
}

function Input({ label, value, onChange, maxLength, multiline, disabled, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; maxLength: number;
  multiline?: boolean; disabled?: boolean; placeholder?: string;
}) {
  return <View style={{ gap: 5 }}><Text style={s.body}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} maxLength={maxLength}
      multiline={multiline} editable={!disabled} placeholder={placeholder} placeholderTextColor={C.muted}
      style={[styles.input, multiline && styles.multiline]} />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' },
  grow: { flex: 1, minWidth: 0, gap: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: C.divider, minHeight: 48 },
  selected: { backgroundColor: '#EDF3FE', borderColor: '#D6E4FF' },
  icon: { alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, backgroundColor: '#EEF4FF' },
  mark: { width: 20, height: 20, borderWidth: 1, borderColor: C.muted, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: '#DEF6E7', color: '#126835', fontSize: 12, fontWeight: '600' },
  waiting: { backgroundColor: '#FFF3D9', color: '#8A4800' },
  status: { color: C.cobalt, fontSize: 13, fontWeight: '600' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#EDF3FE', borderRadius: 11, padding: 11 },
  input: { color: C.text, borderWidth: 1, borderColor: C.divider, borderRadius: 10, minHeight: 44, paddingHorizontal: 11, paddingVertical: 9, fontSize: 15 },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  error: { color: '#B42318', fontSize: 14 },
});
