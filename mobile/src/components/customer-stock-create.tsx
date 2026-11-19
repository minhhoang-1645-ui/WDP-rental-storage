import { ItemPhotos } from '@/components/item-photos';
import { useRef, useState, type ComponentRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useResource } from '@/operations/use-resource';
import { operationMutate } from '@/operations/mutate';
import { stockCreateInput, stockLineIssues } from '@/stock/validation';
import { itemUnits } from '@/stock/item-units';
import type { StockDraftLine, StoredItem } from '@/stock/types';
import { idOf, rows, text, type Row } from '@/operations/model';
import { useDraftGuard } from '@/services/live-events';
import { vietnamCalendarDate } from '@/utils/calendar-date';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState, LoadingState } from './screen-state';
import { inventoryBlue, warehouseName } from './inventory-presentation';

type Direction = 'IN' | 'OUT';
type Option = { value: string; label: string };
const steps = ['Thông tin phiếu', 'Kiểm tra và gửi'];
const freshLine = (key: string): StockDraftLine => ({ key, storedItemId: '', name: '', unit: '', quantity: '1', note: '' });

function FieldError({ message }: { message?: string }) {
  return message ? <Text accessibilityRole="alert" style={s.error}>{message}</Text> : null;
}

function Select({ label, value, options, onChange, placeholder, error }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void; placeholder: string; error?: string;
}) {
  const [open, setOpen] = useState(false);
  return <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }}
      style={[s.control, error && s.invalid]} onPress={() => setOpen(current => !current)}>
      <Text numberOfLines={1} style={s.controlText}>{options.find(option => option.value === value)?.label || placeholder}</Text>
      <ChevronDown size={15} color="#475467"/>
    </Pressable>
    <FieldError message={error}/>
    {open && <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={s.menu}>
      {options.length === 0 && <Text style={s.help}>Không có lựa chọn.</Text>}
      {options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: option.value === value }}
        style={s.option} onPress={() => { onChange(option.value); setOpen(false); }}>
        <Text style={s.controlText}>{option.label}</Text>
        {option.value === value && <Check size={15} color={inventoryBlue}/>}
      </Pressable>)}
    </ScrollView>}
  </View>;
}

function Input({ label, value, onChange, numeric, maxLength, error }: {
  label: string; value: string; onChange: (value: string) => void; numeric?: boolean; maxLength: number; error?: string;
}) {
  return <View style={s.field}><Text style={s.label}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType={numeric ? 'number-pad' : 'default'}
      maxLength={maxLength} style={[s.input, error && s.invalid]}/>
    <FieldError message={error}/>
  </View>;
}

function ItemHeader({ number, name, summary, open, hasErrors, onToggle, onRemove }: {
  number: number; name: string; summary: string; open: boolean; hasErrors: boolean;
  onToggle: () => void; onRemove?: () => void;
}) {
  const swipe = useRef<SwipeableMethods>(null);
  const dragged = useRef(false);
  const [revealed, setRevealed] = useState(false);
  const label = 'Mặt hàng ' + number;
  const Chevron = open ? ChevronUp : ChevronDown;
  const header = <Pressable accessibilityRole="button" accessibilityLabel={label}
    aria-expanded={open} accessibilityState={{ expanded: open }} accessibilityHint={onRemove ? 'Vuốt trái để hiện nút xóa' : undefined}
    accessibilityActions={onRemove ? [{ name: 'showDelete', label: 'Hiện nút xóa' }] : undefined}
    onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'showDelete') swipe.current?.openRight(); }}
    onPressIn={() => { dragged.current = false; }}
    onPress={() => { if (!dragged.current && !revealed) onToggle(); }} style={[s.itemHeader, open && s.openHeader]}>
    <View style={s.number}><Text style={s.currentStep}>{number}</Text></View>
    <View style={[s.half, s.headerCopy]}>
      <Text numberOfLines={1} style={s.label}>{name || label}</Text>
      {hasErrors && !open ? <Text style={s.error}>Cần kiểm tra</Text> : summary ? <Text numberOfLines={1} style={s.help}>{summary}</Text> : null}
    </View>
    <Chevron size={17} color="#475467"/>
  </Pressable>;
  if (!onRemove) return header;
  return <Swipeable ref={swipe} dragOffsetFromRight={-16} rightThreshold={40} overshootRight={false}
    onSwipeableOpenStartDrag={() => { dragged.current = true; }} onSwipeableCloseStartDrag={() => { dragged.current = true; }}
    onSwipeableWillOpen={() => setRevealed(true)} onSwipeableWillClose={() => setRevealed(false)}
    renderRightActions={() => <Pressable accessibilityRole="button" accessibilityLabel={'Xóa mặt hàng ' + number}
      aria-hidden={!revealed} accessible={revealed} accessibilityElementsHidden={!revealed} importantForAccessibility={revealed ? 'yes' : 'no-hide-descendants'}
      focusable={revealed} disabled={!revealed} onPress={onRemove} style={s.deleteAction}>
      <Trash2 size={16} color="white"/><Text style={[s.label, s.white]}>Xóa</Text>
    </Pressable>}>
    {header}
  </Swipeable>;
}

export function CustomerStockCreate({ contract: initialContract, warehouses, initialAction, onClose, onSaved, onBusyChange }: {
  contract: Row; warehouses: Row[]; initialAction?: Direction; onClose: () => void;
  onSaved: (contractId: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  useDraftGuard();
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState(idOf(initialContract));
  const contract = warehouses.find(row => idOf(row) === selectedId);
  const inventory = useResource<StoredItem[]>(contract ? '/customer/stored-items?rentalContractId=' + encodeURIComponent(selectedId) : null);
  const serial = useRef(2);
  const lock = useRef(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [type, setType] = useState<Direction>(initialAction === 'OUT' ? 'OUT' : 'IN');
  const [lines, setLines] = useState<StockDraftLine[]>(() => [freshLine('1')]);
  const [existing, setExisting] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState(() => new Set(['1']));
  const [note, setNote] = useState('');
  const [step, setStep] = useState(1);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showIssues, setShowIssues] = useState(false);
  const positions = useRef(new Map<string, number>());
  const pendingScroll = useRef('');
  const items = (inventory.data ?? []).filter(item => item.balance > 0 && (!item.rentalContract || item.rentalContract.id === selectedId));
  const end = text(contract ?? {}, 'endDate').slice(0, 10);
  const warehouseIssue = !contract ? 'Chọn kho đang sử dụng để tạo phiếu.' : '';
  const typeIssue = type === 'IN' && end && vietnamCalendarDate() >= end
    ? 'Kỳ thuê đã hết hạn. Bạn vẫn có thể tạo phiếu lấy hàng ra để trả kho.' : '';
  const lineIssues = stockLineIssues(selectedId, type, lines, items, existing);

  function resetLines() {
    const line = freshLine(String(serial.current++));
    setLines([line]);
    setExpanded(new Set([line.key]));
    setExisting({});
    setError('');
    setShowIssues(false);
  }

  function patch(key: string, change: Partial<StockDraftLine>) {
    setError('');
    setLines(previous => previous.map(line => line.key === key ? { ...line, ...change } : line));
  }

  function scrollToSection(key: string) {
    const y = positions.current.get(key);
    if (y === undefined) pendingScroll.current = key;
    else scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }

  function trackSection(key: string, y: number) {
    positions.current.set(key, y);
    if (pendingScroll.current === key) {
      pendingScroll.current = '';
      requestAnimationFrame(() => scrollToSection(key));
    }
  }

  function validate() {
    setShowIssues(true);
    const invalid = lineIssues.findIndex(issue => issue.name || issue.unit || issue.quantity);
    const section = warehouseIssue ? 'warehouse' : typeIssue ? 'type' : !inventory.data || inventory.error ? 'inventory' : invalid >= 0 ? lines[invalid].key : '';
    if (!section) return true;
    if (invalid >= 0 && section === lines[invalid].key) setExpanded(previous => new Set(previous).add(section));
    if (step === 2) {
      positions.current.clear();
      setStep(1);
    }
    scrollToSection(section);
    return false;
  }

  function changeStep(value: number) {
    pendingScroll.current = '';
    positions.current.clear();
    setStep(value);
    setError('');
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  function addItem() {
    if (!validate()) return;
    const line = freshLine(String(serial.current++));
    setShowIssues(false);
    setLines(previous => [...previous, line]);
    setExpanded(previous => new Set(previous).add(line.key));
    pendingScroll.current = line.key;
    setError('');
  }

  function toggleItem(key: string) {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function removeItem(key: string) {
    if (lines.length <= 1) return;
    setLines(previous => previous.filter(line => line.key !== key));
    setExpanded(previous => new Set([...previous].filter(value => value !== key)));
    setError('');
  }

  async function advance() {
    if (lock.current || photoBusy) return;
    if (lines.reduce((sum, line) => sum + (line.photos?.length ?? 0), 0) > 3) {
      setError('Mỗi phiếu được đính kèm tối đa 3 ảnh.');
      return;
    }
    try {
      if (!validate()) return;
      if (step < 2) {
        changeStep(step + 1);
        return;
      }
      const input = stockCreateInput(selectedId, type, lines, items, '', note);
      lock.current = true;
      setBusy(true);
      onBusyChange(true);
      setError('');
      const result = await operationMutate('/customer/stock-movements', 'POST', input, true);
      const photoCount = input.lines.reduce((count, line) => count + (line.photos?.length ?? 0), 0);
      const savedPhotoCount = rows(result.lines).reduce((count, line) => count + (Array.isArray(line.photos) ? line.photos.length : 0), 0);
      onSaved(selectedId);
      if (savedPhotoCount < photoCount) Alert.alert('Phiếu đã gửi', 'Máy chủ chưa lưu ảnh. Bạn có thể liên hệ nhân viên và cung cấp mã phiếu ' + text(result, 'movementCode') + '.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa gửi được phiếu. Vui lòng thử lại.');
    } finally {
      if (lock.current) {
        lock.current = false;
        setBusy(false);
        onBusyChange(false);
      }
    }
  }

  const itemOptions = items.map(item => ({ value: item.id, label: item.name + ' · ' + item.balance + ' ' + item.unit }));
  return <View style={[s.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={step > 1 ? 'Về bước trước' : 'Đóng phiếu'}
        disabled={busy} onPress={() => step > 1 ? changeStep(step - 1) : onClose()} style={s.iconButton}><ArrowLeft size={21} color="#192338"/></Pressable>
      <Text accessibilityRole="header" style={s.title}>Tạo phiếu nhập/xuất</Text>
      <View style={s.iconButton}/>
    </View>
    <View style={s.stepRow}>{steps.map((label, index) => <View key={label} style={s.step}>
      <View style={[s.stepNumber, step >= index + 1 && s.stepDone]}>
        <Text style={[s.label, step >= index + 1 && s.white]}>{index + 1}</Text>
      </View>
      <Text style={[s.help, step === index + 1 && s.currentStep]}>{label}</Text>
      {index < steps.length - 1 && <View style={s.connector}/>}
    </View>)}</View>
    <ScrollView pointerEvents={busy ? 'none' : 'auto'} ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {step === 1 ? <>
        <View onLayout={event => trackSection('warehouse', event.nativeEvent.layout.y)}>
          <Select label="Kho" placeholder="Chọn kho đang dùng" value={selectedId} error={warehouseIssue}
            options={warehouses.map(row => ({ value: idOf(row), label: warehouseName(row) }))}
            onChange={value => { if (value !== selectedId) { setSelectedId(value); resetLines(); } }}/>
        </View>
        <View style={s.field} onLayout={event => trackSection('type', event.nativeEvent.layout.y)}><Text style={s.label}>Loại phiếu</Text><View style={s.row}>
          {(['IN', 'OUT'] as const).map(value => {
            const Icon = value === 'IN' ? ArrowUpFromLine : ArrowDownToLine;
            return <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: value === type }}
              style={[s.control, s.half, s.center, type === value && s.primary]} onPress={() => { if (value !== type) { setType(value); resetLines(); } }}>
              <Icon size={15} color={value === type ? 'white' : inventoryBlue}/>
              <Text style={[s.label, type === value && s.white]}>{value === 'IN' ? 'Gửi hàng vào' : 'Lấy hàng ra'}</Text>
            </Pressable>;
          })}
        </View><FieldError message={typeIssue}/></View>
        <View onLayout={event => trackSection('inventory', event.nativeEvent.layout.y)}>
          {inventory.loading ? <LoadingState layout="compact"/> : inventory.error ? <ErrorState message={inventory.error} onRetry={inventory.refresh}/> : null}
        </View>
        {type === 'OUT' && inventory.data && !items.length && <Text style={s.help}>Kho này chưa có hàng được kiểm đếm để lấy ra.</Text>}
        {lines.length > 1 && <Text style={s.help}>Vuốt trái trên tiêu đề mặt hàng để hiện nút xóa.</Text>}
        {lines.map((line, index) => {
          const item = items.find(value => value.id === line.storedItemId);
          const useExisting = type === 'OUT' || existing[line.key];
          const open = expanded.has(line.key);
          const issues = showIssues ? lineIssues[index] : undefined;
          const name = item?.name || (!useExisting ? line.name.trim() : '');
          const unit = item?.unit || (!useExisting ? line.unit : '');
          return <View key={line.key} style={[s.itemCard, open && s.openCard]} onLayout={event => trackSection(line.key, event.nativeEvent.layout.y)}>
            <ItemHeader number={index + 1} name={name} summary={name && unit ? line.quantity + ' ' + unit : ''}
              open={open} hasErrors={Boolean(issues?.name || issues?.unit || issues?.quantity)} onToggle={() => toggleItem(line.key)}
              onRemove={lines.length > 1 ? () => removeItem(line.key) : undefined}/>
            {open && <View style={s.line}>
              {type === 'IN' && <View style={s.row}>{[true, false].map(value => <Pressable key={String(value)} accessibilityRole="radio"
                accessibilityState={{ checked: Boolean(useExisting) === value }} style={[s.option, s.half, s.inlineOption]}
                onPress={() => { if (Boolean(useExisting) !== value) { setExisting(previous => ({ ...previous, [line.key]: value })); patch(line.key, { storedItemId: '' }); } }}>
                <View style={[s.radio, Boolean(useExisting) === value && s.radioSelected]}/>
                <Text style={[s.help, s.half]}>{value ? 'Chọn hàng đã lưu' : 'Thêm hàng mới'}</Text>
              </Pressable>)}</View>}
              {useExisting ? <Select label="Tên hàng" value={line.storedItemId} placeholder="Chọn hàng đang lưu" options={itemOptions} error={issues?.name}
                onChange={value => patch(line.key, { storedItemId: value })}/> :
                <Input label="Tên hàng" value={line.name} error={issues?.name} onChange={value => patch(line.key, { name: value })} maxLength={160}/>}
              <View style={s.row}>
                <View style={s.half}><Input label="Số lượng" numeric value={line.quantity} error={issues?.quantity ?? (type === 'OUT' && item && Number(line.quantity) > item.balance ? 'Số lượng xuất vượt tồn hiện tại (' + item.balance + ' ' + item.unit + ').' : undefined)} onChange={value => patch(line.key, { quantity: value })} maxLength={7}/></View>
                <View style={s.half}>{useExisting ? <View style={s.field}><Text style={s.label}>Đơn vị</Text><View style={s.control}><Text style={s.controlText}>{item?.unit || '—'}</Text></View></View> :
                  <Select label="Đơn vị" value={line.unit} placeholder="Chọn đơn vị" options={itemUnits.map(unit => ({ value: unit, label: unit }))} error={issues?.unit} onChange={value => patch(line.key, { unit: value })}/>}</View>
              </View>
              <Text style={s.label}>Ảnh mặt hàng (tùy chọn)</Text>
              <ItemPhotos editable photos={line.photos ?? []} onChange={photos => patch(line.key, { photos })} onBusyChange={setPhotoBusy} />
              <Input label="Ghi chú mặt hàng (tùy chọn)" value={line.note} onChange={value => patch(line.key, { note: value })} maxLength={500}/>
            </View>}
          </View>;
        })}
        {lines.length < 100 && <Pressable accessibilityRole="button" style={s.addItem} onPress={addItem}>
          <Plus size={16} color={inventoryBlue}/><Text style={s.currentStep}>Thêm mặt hàng</Text>
        </Pressable>}
        <Input label="Ghi chú phiếu (tùy chọn)" value={note} onChange={setNote} maxLength={2000}/>
      </> : <>
        <View style={s.reviewCard}>
          <Text style={s.label}>{type === 'IN' ? 'Gửi hàng vào kho' : 'Lấy hàng ra khỏi kho'}</Text>
          <Text style={s.help}>{contract ? warehouseName(contract) : 'Kho không còn khả dụng'}</Text>
          {Boolean(note.trim()) && <Text style={s.help}>Ghi chú phiếu: {note.trim()}</Text>}
        </View>
        {lines.map(line => {
          const item = items.find(value => value.id === line.storedItemId);
          return <View key={line.key} style={s.reviewCard}>
            <View style={s.row}><Text style={[s.label, s.half]}>{item?.name || line.name}</Text><Text style={s.label}>{line.quantity} {item?.unit || line.unit}</Text></View>
            <ItemPhotos photos={line.photos ?? []} />
            {Boolean(line.note.trim()) && <Text style={s.help}>{line.note.trim()}</Text>}
          </View>;
        })}
        <Text style={s.help}>Số lượng đang lưu sẽ cập nhật sau khi nhân viên giao nhận và kiểm đếm.</Text>
      </>}
    </ScrollView>
    <View style={s.footer}><FieldError message={error}/><Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy || photoBusy || inventory.loading }}
      disabled={busy || photoBusy || inventory.loading} style={[s.submit, (busy || photoBusy || inventory.loading) && s.disabled]} onPress={() => void advance()}>
      <Text style={[s.label, s.white]}>{busy ? 'Đang gửi phiếu…' : step === 1 ? 'Kiểm tra phiếu' : 'Gửi phiếu'}</Text>
    </Pressable></View>
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minHeight: 48 },
  title: { flex: 1, textAlign: 'center', color: inventoryBlue, fontSize: 18, fontWeight: '700' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  stepRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8 },
  step: { flex: 1, alignItems: 'center', gap: 4 },
  stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#E3E8F1', alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: inventoryBlue },
  connector: { position: 'absolute', top: 11, left: '68%', width: '64%', height: 1, backgroundColor: '#CCD5E4' },
  currentStep: { color: inventoryBlue, fontWeight: '700', fontSize: 13 },
  content: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 22, gap: 12 },
  field: { gap: 4 },
  label: { fontSize: 13, fontWeight: '700', color: '#17243A' },
  help: { fontSize: 12, lineHeight: 17, color: '#475467' },
  control: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42, borderWidth: 1, borderColor: '#D7DFEC', borderRadius: 8, paddingHorizontal: 10 },
  controlText: { flex: 1, minWidth: 0, color: '#17243A', fontSize: 13 },
  input: { minHeight: 42, borderWidth: 1, borderColor: '#D7DFEC', borderRadius: 8, paddingHorizontal: 10, color: '#17243A', fontSize: 14 },
  menu: { maxHeight: 176, backgroundColor: '#F5F7FC', borderRadius: 8, paddingHorizontal: 8 },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  inlineOption: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: '#C4CBD9' },
  radioSelected: { borderWidth: 5, borderColor: inventoryBlue },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  center: { justifyContent: 'center' },
  primary: { backgroundColor: inventoryBlue, borderColor: inventoryBlue },
  white: { color: 'white' },
  line: { gap: 10, padding: 12 },
  itemCard: { borderWidth: 1, borderColor: '#E1E6EF', borderRadius: 12, backgroundColor: '#FCFDFF', overflow: 'hidden' },
  openCard: { borderColor: '#B9CEF3' },
  itemHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: 'white' },
  openHeader: { borderBottomWidth: 1, borderBottomColor: '#E6EBF3' },
  headerCopy: { gap: 2 },
  deleteAction: { width: 76, gap: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#B42318' },
  number: { width: 25, height: 25, borderRadius: 8, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center' },
  addItem: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#9DB9EC', backgroundColor: '#F5F8FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  reviewCard: { padding: 10, borderWidth: 1, borderColor: '#E3E8F0', borderRadius: 10, gap: 5 },
  error: { color: '#B42318', fontSize: 13 },
  invalid: { borderColor: '#B42318' },
  footer: { gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#E6EBF3' },
  submit: { minHeight: 44, borderRadius: 9, backgroundColor: inventoryBlue, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.55 },
});
