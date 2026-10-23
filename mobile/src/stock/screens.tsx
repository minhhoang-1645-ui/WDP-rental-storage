import { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router/stack';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState, EmptyState } from '@/components/screen-state';
import { Button, Facts, Field, Navigation, Panel, styles } from '@/operations/ui';
import { useResource } from '@/operations/use-resource';
import { OperationForm, type FormAction } from '@/operations/form';
import { operationMutate } from '@/operations/mutate';
import { label, type Row } from '@/operations/model';
import { formatDate } from '@/utils/format';
import { stockCompleteInput, stockCreateInput } from './validation';
import type { StockDraftLine, StockMovement, StockRole, StoredItem } from './types';

const states = { REQUESTED: 'Chờ phân công', ASSIGNED: 'Đã phân công', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy' };
let sequence = 0;
const freshLine = (): StockDraftLine => ({ key: String(++sequence), name: '', unit: '', quantity: '1', note: '', storedItemId: '' });
type Page<T> = { items: T[]; total: number };
export function StockList({ role }: { role: StockRole }) {
  const { user } = useAuth(), root = `/${role.toLowerCase()}`;
  const data = useResource<Page<StockMovement>>(user?.role === role ? `${root}/stock-movements` : null, true);
  const [creating, setCreating] = useState(false), [search, setSearch] = useState(''), [status, setStatus] = useState(''), [type, setType] = useState(''), [notice, setNotice] = useState('');
  const shown = data.data?.items.filter(item => (!status || item.status === status) && (!type || item.type === type) && `${item.movementCode} ${item.rentalContract.contractCode} ${item.customer.fullName}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))) ?? [];
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={styles.page}>
    <Stack.Screen options={{ title: 'Nhập – xuất hàng' }} /><PageHeader eyebrow={label(role)} title="Nhập – xuất hàng khách" description="Tồn chỉ thay đổi khi nhân viên được giao xác nhận kiểm đếm và hoàn tất phiếu." />
    <Navigation title="Về tổng quan" path={root} /><Button title="Làm mới" onPress={data.refresh} disabled={data.loading || creating} />
    {role === 'CUSTOMER' && <><Navigation title="Hàng đang lưu" path="/customer/stored-items" />{!creating && <Button title="Tạo phiếu nhập / xuất" onPress={() => setCreating(true)} />}</>}
    {Boolean(notice) && <Text accessibilityRole="alert" style={styles.success}>{notice}</Text>}
    {creating && <StockCreate onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setNotice('Đã gửi yêu cầu. Tồn hàng chưa thay đổi.'); data.refresh(); }} />}
    <Field title="Tìm mã phiếu, hợp đồng hoặc khách hàng" value={search} onChange={setSearch} maxLength={100} />
    <View style={styles.row}>{[['', 'Mọi trạng thái'], ...Object.entries(states)].map(([value, title]) => <Button key={value} title={`${status === value ? '✓ ' : ''}${title}`} variant={status === value ? 'primary' : 'secondary'} onPress={() => setStatus(value)} />)}</View>
    <View style={styles.row}>{[['', 'Mọi loại phiếu'], ['IN', 'Nhập hàng'], ['OUT', 'Xuất hàng']].map(([value, title]) => <Button key={value} title={`${type === value ? '✓ ' : ''}${title}`} variant={type === value ? 'primary' : 'secondary'} onPress={() => setType(value)} />)}</View>
    {data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : <>{!shown.length && <EmptyState title="Chưa có phiếu phù hợp" message="Đổi bộ lọc hoặc tải lại danh sách." />}{shown.map(item => <Navigation key={item.id} title={item.movementCode} description={`${item.type === 'IN' ? 'Nhập hàng' : 'Xuất hàng'} · ${states[item.status]} · ${item.rentalContract.contractCode} · ${item.assignedStaff?.fullName ?? 'Chưa phân công'}`} path={`${root}/stock-movements/${encodeURIComponent(item.id)}`} />)}</>}
  </ScrollView>;
}
function StockCreate({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const contracts = useResource<Page<{ id: string; contractCode: string; status: string }>>('/customer/contracts', true);
  const [contract, setContract] = useState(''), [type, setType] = useState<'IN' | 'OUT'>('IN'), [lines, setLines] = useState([freshLine()]), [scheduledAt, setScheduledAt] = useState(''), [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), lock = useRef(false);
  const items = useResource<StoredItem[]>(contract ? `/customer/stored-items?rentalContractId=${encodeURIComponent(contract)}` : null);
  const patch = (key: string, changes: Partial<StockDraftLine>) => setLines(current => current.map(item => item.key === key ? { ...item, ...changes } : item));
  const submit = async () => {
    if (lock.current) return; setError('');
    try {
      if (!confirmed) throw new Error('Xác nhận đã đối chiếu hàng hóa và số lượng.');
      if (!contracts.data?.items.some(item => item.id === contract && item.status === 'ACTIVE')) throw new Error('Chọn hợp đồng đang hoạt động của bạn.');
      if (items.loading || items.error) throw new Error('Cần tải thành công danh sách hàng trước khi gửi.');
      const input = stockCreateInput(contract, type, lines, items.data ?? [], scheduledAt, note);
      lock.current = true; setBusy(true); await operationMutate('/customer/stock-movements', 'POST', input, true); onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không gửi được phiếu.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Panel title="Tạo phiếu nhập / xuất"><Text style={styles.copy}>Chọn hợp đồng ACTIVE. Lịch dự kiến theo giờ Việt Nam (UTC+7), có thể bỏ trống.</Text>
    {contracts.loading ? <LoadingState /> : contracts.error ? <ErrorState message={contracts.error} onRetry={contracts.refresh} /> : <>{!contracts.data?.items.some(item => item.status === 'ACTIVE') && <Text style={styles.copy}>Chưa có hợp đồng hoạt động. Hoàn tất bàn giao kho trước.</Text>}{contracts.data?.items.filter(item => item.status === 'ACTIVE').map(item => <Button key={item.id} title={`${contract === item.id ? '✓ ' : ''}${item.contractCode}`} variant={contract === item.id ? 'primary' : 'secondary'} disabled={busy} onPress={() => { setContract(item.id); setLines([freshLine()]); setConfirmed(false); }} />)}</>}
    <View style={styles.row}>{(['IN', 'OUT'] as const).map(value => <Button key={value} title={`${type === value ? '✓ ' : ''}${value === 'IN' ? 'Nhập hàng' : 'Xuất hàng'}`} variant={type === value ? 'primary' : 'secondary'} disabled={busy} onPress={() => { setType(value); setLines([freshLine()]); setConfirmed(false); }} />)}</View>
    <Field title="Ngày giờ dự kiến (YYYY-MM-DD HH:mm, tùy chọn)" value={scheduledAt} onChange={setScheduledAt} maxLength={16} disabled={busy} />
    {items.loading ? <LoadingState /> : items.error && <ErrorState message={items.error} onRetry={items.refresh} />}
    {lines.map((line, index) => <Panel key={line.key} title={`Hàng ${index + 1}`}>
      {type === 'IN' && <Button title={`${!line.storedItemId ? '✓ ' : ''}Nhập mặt hàng mới`} variant={!line.storedItemId ? 'primary' : 'secondary'} disabled={busy} onPress={() => patch(line.key, { storedItemId: '' })} />}
      {items.data?.map(item => <Button key={item.id} title={`${line.storedItemId === item.id ? '✓ ' : ''}${item.name} · ${item.itemCode} · tồn ${item.balance} ${item.unit}`} variant={line.storedItemId === item.id ? 'primary' : 'secondary'} disabled={busy} onPress={() => patch(line.key, { storedItemId: item.id })} />)}
      {type === 'OUT' && !items.loading && !items.data?.length && <Text style={styles.copy}>Hợp đồng chưa có hàng tồn để xuất.</Text>}
      {type === 'IN' && !line.storedItemId && <><Field title={`Tên hàng ${index + 1}`} value={line.name} onChange={value => patch(line.key, { name: value })} maxLength={160} disabled={busy} /><Field title={`Đơn vị hàng ${index + 1}`} value={line.unit} onChange={value => patch(line.key, { unit: value })} maxLength={40} disabled={busy} /></>}
      <Field title={`Số lượng yêu cầu hàng ${index + 1}`} numeric value={line.quantity} onChange={value => patch(line.key, { quantity: value })} maxLength={7} disabled={busy} /><Field title={`Ghi chú hàng ${index + 1}`} value={line.note} onChange={value => patch(line.key, { note: value })} maxLength={500} disabled={busy} />
      <Button title={`Bỏ dòng ${index + 1}`} variant="secondary" disabled={busy || lines.length === 1} onPress={() => setLines(current => current.filter(item => item.key !== line.key))} />
    </Panel>)}
    <Button title="Thêm dòng hàng" disabled={busy || lines.length >= 100} onPress={() => setLines(current => [...current, freshLine()])} />
    <Field title="Ghi chú phiếu" value={note} onChange={setNote} maxLength={2000} multiline disabled={busy} />
    <Button title={`${confirmed ? '✓ ' : '□ '}Tôi đã đối chiếu hàng hóa và số lượng yêu cầu`} variant={confirmed ? 'primary' : 'secondary'} disabled={busy} onPress={() => setConfirmed(value => !value)} />
    {Boolean(error) && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}<Button title={busy ? 'Đang gửi…' : 'Gửi phiếu'} disabled={busy || !contract || contracts.loading || Boolean(contracts.error) || items.loading || Boolean(items.error)} onPress={() => void submit()} /><Button title="Hủy" variant="secondary" disabled={busy} onPress={onClose} />
  </Panel>;
}
export function StockDetail({ role }: { role: StockRole }) {
  const { id } = useLocalSearchParams<{ id: string }>(), { user } = useAuth(), root = `/${role.toLowerCase()}`;
  const data = useResource<StockMovement>(user?.role === role ? `${root}/stock-movements/${encodeURIComponent(String(id))}` : null);
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={styles.page}><Stack.Screen options={{ title: 'Chi tiết nhập – xuất' }} /><PageHeader eyebrow={label(role)} title={data.data?.movementCode ?? 'Chi tiết nhập – xuất'} description="Đối chiếu hàng hóa, số lượng và nhân viên trước khi xác nhận." /><Navigation title="Về danh sách phiếu" path={`${root}/stock-movements`} /><Button title="Làm mới hồ sơ" onPress={data.refresh} disabled={data.loading} />{data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : data.data && <StockRecord key={`${data.data.id}:${data.data.updatedAt}`} row={data.data} role={role} refresh={data.refresh} />}</ScrollView>;
}
function StockRecord({ row, role, refresh }: { row: StockMovement; role: StockRole; refresh: () => void }) {
  const { user } = useAuth(), [action, setAction] = useState<FormAction>();
  const assignable = role === 'MANAGER' && ['REQUESTED', 'ASSIGNED'].includes(row.status), completable = role === 'STAFF' && row.status === 'ASSIGNED' && row.assignedStaff?.id === user?.id;
  const confirm = { name: 'confirm', title: 'Tôi đã đối chiếu và xác nhận thao tác thực tế', required: true, checkbox: true, clientOnly: true };
  const assignment: FormAction = { title: 'Phân công nhân viên', path: `/manager/stock-movements/${encodeURIComponent(row.id)}/assign`, method: 'PATCH', description: 'Lấy mã tài khoản STAFF đang hoạt động từ Admin → Quản lý tài khoản. BE chưa có danh bạ Staff cho Manager; không dùng email thay mã.', fields: [{ name: 'staffUserId', title: 'Mã tài khoản Staff', required: true, maxLength: 200, initial: row.assignedStaff?.id }, confirm] };
  const complete: FormAction = { title: 'Hoàn tất phiếu', path: `/staff/stock-movements/${encodeURIComponent(row.id)}/complete`, method: 'POST', description: 'Chỉ xác nhận sau khi đã giao nhận và kiểm đếm thực tế. Tồn thay đổi theo số lượng thực tế, có thể khác số lượng yêu cầu.', fields: [...row.lines.map(line => ({ name: line.id, title: `Số lượng thực tế · ${line.storedItem.name}`, required: true, numeric: true, minimum: 1, maximum: row.type === 'OUT' ? Math.min(1000000, line.storedItem.balance) : 1000000, initial: String(line.requestedQty) })), { name: 'note', title: 'Ghi chú kiểm đếm', maxLength: 2000, multiline: true }, confirm], transform: input => stockCompleteInput(row, Object.fromEntries(row.lines.map(line => [line.id, String(input[line.id] ?? '')])), String(input.note ?? '')) as Row };
  return <View style={{ gap: 14 }}><Panel title="Thông tin phiếu"><Facts values={[
    ['Loại phiếu', row.type === 'IN' ? 'Nhập hàng' : 'Xuất hàng'], ['Trạng thái', states[row.status]], ['Khách hàng', row.customer.fullName], ['Email', row.customer.email], ['Hợp đồng', row.rentalContract.contractCode], ['Lịch dự kiến', formatDate(row.scheduledAt ?? '', true)], ['Nhân viên', row.assignedStaff?.fullName], ['Mã nhân viên', row.assignedStaff?.id], ['Người phân công', row.assignedBy?.fullName], ['Ngày phân công', formatDate(row.assignedAt ?? '', true)], ['Ngày hoàn tất', formatDate(row.completedAt ?? '', true)], ['Người hoàn tất', row.completedBy?.fullName], ['Ghi chú', row.note], ['Kết quả kiểm đếm', row.completionNote],
  ]} /></Panel>{row.lines.map(line => <Panel key={line.id} title={line.storedItem.name}><Facts values={[["Mã hàng", line.storedItem.itemCode], ['Đơn vị', line.storedItem.unit], ['Số lượng yêu cầu', line.requestedQty], ['Số lượng thực tế', line.actualQty], ['Tồn hiện tại', line.storedItem.balance], ['Ghi chú', line.note]]} /></Panel>)}
    {action ? <OperationForm action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); refresh(); }} /> : <>{assignable && <Button title="Phân công nhân viên" onPress={() => setAction(assignment)} />}{completable && <Button title="Hoàn tất phiếu" onPress={() => setAction(complete)} />}</>}
  </View>;
}
export function StoredItems() {
  const { user } = useAuth(), data = useResource<StoredItem[]>(user?.role === 'CUSTOMER' ? '/customer/stored-items' : null);
  const [search, setSearch] = useState('');
  const items = data.data?.filter(item => `${item.name} ${item.itemCode} ${item.rentalContract?.contractCode}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))) ?? [];
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={styles.page}><Stack.Screen options={{ title: 'Hàng đang lưu' }} /><PageHeader eyebrow="Khách hàng" title="Hàng đang lưu" description="Chỉ hiển thị hàng có tồn lớn hơn 0 đã được xác nhận thực tế." /><Navigation title="Phiếu nhập – xuất" path="/customer/stock-movements" /><Field title="Tìm hàng hoặc hợp đồng" value={search} onChange={setSearch} maxLength={100} /><Button title="Làm mới" onPress={data.refresh} disabled={data.loading} />{data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : <>{!items.length && <EmptyState title="Chưa có hàng tồn phù hợp" message="Tồn thay đổi sau khi Staff hoàn tất phiếu nhập/xuất." />}{items.map(item => <Panel key={item.id} title={item.name}><Facts values={[["Mã hàng", item.itemCode], ['Hợp đồng', item.rentalContract?.contractCode], ['Tồn', `${item.balance} ${item.unit}`], ['Ghi chú', item.note]]} /></Panel>)}</>}</ScrollView>;
}
