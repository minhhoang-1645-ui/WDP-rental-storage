import { useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown, Check } from 'lucide-react-native';
import { useResource } from '@/operations/use-resource';
import { operationMutate } from '@/operations/mutate';
import { idOf, label, rows, text, type Row } from '@/operations/model';
import { Button, Field, Panel } from '@/operations/ui';
import { useDraftGuard } from '@/services/live-events';
import { recordMatches } from '@/utils/record-search';
import { ErrorState, LoadingState } from './screen-state';
import { staffStyles as s, StaffStatusBadge } from './staff-ui';
import { WdpColors as C } from '@/constants/wdp-theme';

const reasons = ['UNIT_ISSUE', 'FACILITY_EQUIPMENT_FAILURE', 'OPERATIONAL_RELOCATION', 'OTHER'];
export function StaffTransferForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  useDraftGuard();
  const contracts = useResource<Row>('/manager/contracts?status=ACTIVE', true);
  const [selected, setSelected] = useState<Row>();
  const [picker, setPicker] = useState<'contract' | 'reason'>();
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState('UNIT_ISSUE');
  const [detail, setDetail] = useState(''), [supportId, setSupportId] = useState('');
  const [review, setReview] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const eligible = (row: Row) => row.status === 'ACTIVE';
  const matches = rows(contracts.data?.items).filter(row => eligible(row) && recordMatches(row, query));
  const change = () => { setReview(false); setConfirmed(false); setError(''); };
  const submit = async () => {
    if (lock.current) return;
    if (!selected || !rows(contracts.data?.items).some(row => idOf(row) === idOf(selected) && eligible(row))) { setError('Chọn hợp đồng đang hoạt động còn trong danh sách.'); return; }
    if (contracts.loading || contracts.error) { setError('Cần tải lại danh sách hợp đồng trước khi tạo.'); return; }
    if (!reasons.includes(reason)) { setError('Chọn lý do chuyển kho hợp lệ.'); return; }
    if (supportId.trim().length > 100) { setError('Mã hỗ trợ tối đa 100 ký tự.'); return; }
    if (!review) { setReview(true); return; }
    if (!confirmed) { setError('Xác nhận đã kiểm tra thông tin phiếu.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      // Current API persists a reason enum, not free-text reason details.
      await operationMutate('/staff/management/transfers', 'POST', { rentalContractId: idOf(selected), reason, supportRequestId: supportId.trim() || undefined }, true);
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không tạo được phiếu.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={{ gap: 16 }}>
    <Text style={s.section}>1. Hợp đồng</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Chọn hoặc đổi hợp đồng" disabled={busy} onPress={() => { setQuery(''); setPicker('contract'); }} style={[s.link, s.surface, { borderRadius: 12 }]}><View style={{ flex: 1, gap: 4 }}><Text style={s.body}>{selected ? text(selected, 'reservation.customer.fullName', 'customer.fullName') || 'Hợp đồng đã chọn' : 'Chọn hợp đồng'}</Text>{selected && <Text style={s.secondary}>{[text(selected, 'storageUnit.unitCode', 'unit.unitCode'), text(selected, 'contractCode')].filter(Boolean).join(' · ')}</Text>}</View><ChevronDown size={20} color={C.navy} /></Pressable>
    <Text style={s.section}>2. Lý do chuyển</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Chọn lý do chuyển kho" disabled={busy} onPress={() => setPicker('reason')} style={[s.link, s.surface, { borderRadius: 12 }]}><Text style={[s.body, { flex: 1 }]}>{label(reason)}</Text><ChevronDown size={20} color={C.navy} /></Pressable>
    {reason === 'OTHER' && <><Field title="Lý do chi tiết" value={detail} onChange={value => { setDetail(value); change(); }} maxLength={2000} multiline disabled={busy} /><Text style={s.secondary}>API hiện chỉ lưu loại lý do “Khác”. Nội dung chi tiết ở đây chỉ dùng rà soát, chưa được lưu vào phiếu.</Text></>}
    <Text style={s.section}>3. Thông tin liên quan</Text>
    <Field title="Mã hỗ trợ liên quan (tùy chọn)" value={supportId} onChange={value => { setSupportId(value); change(); }} maxLength={100} disabled={busy} />
    {review && selected && <Panel title="Kiểm tra trước khi tạo"><Text style={s.body}>{text(selected, 'reservation.customer.fullName', 'customer.fullName')}</Text><Text style={s.secondary}>{text(selected, 'contractCode')} · {label(reason)}</Text><Text style={s.secondary}>Phiếu mới chưa chọn kho đích và chưa thực hiện chuyển.</Text>{reason === 'OTHER' && detail.trim() ? <Text style={s.secondary}>Ghi chú rà soát (không lưu): {detail.trim()}</Text> : null}<Pressable accessibilityRole="checkbox" accessibilityState={{ checked: confirmed, disabled: busy }} disabled={busy} onPress={() => { setConfirmed(value => !value); setError(''); }} style={{ minHeight: 48, flexDirection: 'row', gap: 8, alignItems: 'center' }}><View style={{ width: 24, height: 24, borderWidth: 1, borderRadius: 4, borderColor: C.navy }}>{confirmed && <Check size={22} color={C.navy} />}</View><Text style={[s.body, { flex: 1 }]}>Tôi đã đối chiếu thông tin và xác nhận tạo phiếu</Text></Pressable></Panel>}
    {Boolean(error) && <Text accessibilityRole="alert" style={[s.secondary, { color: C.danger }]}>{error}</Text>}
    <Button title={busy ? 'Đang tạo…' : review ? 'Tạo phiếu chuyển kho' : 'Kiểm tra phiếu'} disabled={busy} onPress={() => void submit()} />
    <Button title="Hủy" variant="secondary" disabled={busy} onPress={onClose} />
    <Modal visible={Boolean(picker)} animationType="slide" presentationStyle={picker === 'reason' ? 'pageSheet' : 'fullScreen'} onRequestClose={() => { if (!busy) setPicker(undefined); }}><SafeAreaView style={{ flex: 1, backgroundColor: C.background }}><View style={{ padding: 16, gap: 12, flex: 1 }}><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Text style={[s.title, { flex: 1 }]}>{picker === 'contract' ? 'Chọn hợp đồng' : 'Lý do chuyển kho'}</Text><Pressable accessibilityRole="button" onPress={() => setPicker(undefined)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={s.body}>Đóng</Text></Pressable></View>
      {picker === 'contract' ? <><Field title="Tìm khách hàng, kho, hợp đồng" value={query} onChange={setQuery} maxLength={120} />{contracts.loading ? <LoadingState layout="list" /> : contracts.error ? <ErrorState message={contracts.error} onRetry={contracts.refresh} /> : <FlatList data={matches} keyExtractor={row => idOf(row)} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected && idOf(selected) === idOf(item) }} onPress={() => { setSelected(item); change(); setPicker(undefined); }} style={[s.link, { backgroundColor: C.surface, padding: 12 }]}><View style={{ flex: 1, gap: 4 }}><Text style={s.body}>{text(item, 'reservation.customer.fullName', 'customer.fullName') || 'Khách hàng'}</Text><Text style={s.secondary}>{[text(item, 'storageUnit.unitCode', 'unit.unitCode'), text(item, 'contractCode')].filter(Boolean).join(' · ')}</Text><StaffStatusBadge status={String(item.status)} /><Text style={s.secondary}>Hợp đồng đang hoạt động · Kho nguồn sẽ được kiểm tra khi tạo</Text></View>{selected && idOf(selected) === idOf(item) && <Check size={20} color={C.navy} />}</Pressable>} ListEmptyComponent={<Text style={s.secondary}>Không có hợp đồng phù hợp.</Text>} />}</> : <ScrollView>{reasons.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: reason === value }} onPress={() => { setReason(value); change(); setPicker(undefined); }} style={[s.link, { backgroundColor: C.surface }]}><Text style={[s.body, { flex: 1 }]}>{label(value)}</Text>{reason === value && <Check size={20} color={C.navy} />}</Pressable>)}</ScrollView>}
    </View></SafeAreaView></Modal>
  </View>;
}
