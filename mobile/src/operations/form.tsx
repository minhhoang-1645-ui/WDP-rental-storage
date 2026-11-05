import { CheckSquare, Square } from 'lucide-react-native';
import { WdpColors } from '@/constants/wdp-theme';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { object, type Row } from './model';
import { Button, Field, styles } from './ui';
import { operationMutate } from './mutate';
import { useResource } from './use-resource';
import { useDraftGuard } from '@/services/live-events';

export interface FormField { name: string; title: string; required?: boolean; minLength?: number; maxLength?: number; numeric?: boolean; minimum?: number; maximum?: number; initial?: string; fixed?: boolean; secure?: boolean; multiline?: boolean; choices?: { value: string; label: string }[]; optionsPath?: string; optionsAccept?: (row: Row) => boolean; optionLabel?: (row: Row) => string; checkbox?: boolean; clientOnly?: boolean }
export interface FormAction { title: string; path: string; resolvePath?: (input: Row) => string; method: 'POST' | 'PATCH'; fields: FormField[]; idempotent?: boolean; description?: string; submitTitle?: string; transform?: (input: Row) => Row; validateValues?: (input: Row) => string | undefined; validate?: (input: Row) => string | undefined }

function Input({ field, value, onChange, busy }: { field: FormField; value: string; onChange: (value: string) => void; busy: boolean }) {
  const [search, setSearch] = useState('');
  const resource = useResource<{ items: Row[] }>(field.optionsPath ?? null, true);
  const choices = field.choices ?? resource.data?.items.filter(row => !field.optionsAccept || field.optionsAccept(row)).map(row => ({ value: String(row.id ?? ''), label: field.optionLabel?.(row) ?? String(row.fullName ?? row.contractCode ?? row.unitCode ?? row.id) }));
  const normalize = (text: string) => text.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const shownChoices = choices?.filter(choice => normalize(choice.label).includes(normalize(search.trim())));
  const selectedChoice = choices?.find(choice => choice.value === value);
  if (field.checkbox) return <Pressable accessibilityRole="checkbox" accessibilityLabel={field.title} aria-checked={value === 'true'} accessibilityState={{ checked: value === 'true', disabled: busy || field.fixed }} disabled={busy || field.fixed} onPress={() => onChange(value === 'true' ? 'false' : 'true')} style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, opacity: busy || field.fixed ? 0.5 : pressed ? 0.7 : 1 })}>{value === 'true' ? <CheckSquare size={24} color={WdpColors.navy} /> : <Square size={24} color={WdpColors.muted} />}<Text style={[styles.copy, { flex: 1, color: WdpColors.text }]}>{field.title}</Text></Pressable>;
  if (choices || field.optionsPath) return <View style={{ gap: 8 }}>
    <Text style={styles.label}>{field.title}</Text>
    {(field.optionsPath || (choices?.length ?? 0) > 5) && <Field title={`Tìm ${field.title.toLowerCase()}`} value={search} onChange={setSearch} disabled={busy || field.fixed} maxLength={120} />}
    {selectedChoice && <Text style={styles.copy}>Đã chọn: {selectedChoice.label}</Text>}
    {resource.error && <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={styles.error}>{resource.error}</Text><Button title={`Tải lại ${field.title.toLowerCase()}`} variant="secondary" onPress={resource.refresh} disabled={busy || resource.loading} /></View>}
    {resource.loading ? <Text style={styles.copy}>Đang tải lựa chọn…</Text> : <ScrollView style={{ maxHeight: 330 }} nestedScrollEnabled keyboardShouldPersistTaps="handled"><View accessibilityRole="radiogroup" accessibilityLabel={field.title} style={{ gap: 8 }}>
      {!field.required && <Button variant={!value ? 'primary' : 'secondary'} title={!value ? '✓ Không chọn' : 'Không chọn'} disabled={busy || field.fixed} onPress={() => onChange('')} />}
      {shownChoices?.map(choice => <Pressable key={choice.value} accessibilityRole="radio" aria-checked={value === choice.value} accessibilityLabel={choice.label} accessibilityState={{ checked: value === choice.value, disabled: busy || field.fixed }} disabled={busy || field.fixed} onPress={() => onChange(choice.value)} style={{ minHeight: 56, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: value === choice.value ? WdpColors.navy : WdpColors.border, backgroundColor: value === choice.value ? WdpColors.soft : WdpColors.surface }}><Text style={styles.label}>{value === choice.value ? '✓ ' : ''}{choice.label.split(' · ')[0]}</Text>{choice.label.includes(' · ') && <Text style={styles.copy}>{choice.label.split(' · ').slice(1).join(' · ')}</Text>}</Pressable>)}
      {shownChoices?.length === 0 && <View style={{ gap: 8 }}><Text style={styles.copy}>{choices?.length ? 'Không tìm thấy lựa chọn theo từ khóa này.' : 'Chưa có lựa chọn phù hợp.'}</Text>{Boolean(search.trim()) && <Button title="Xóa từ khóa tìm kiếm" variant="secondary" onPress={() => setSearch('')} disabled={busy} />}</View>}
    </View></ScrollView>}
  </View>;
  return <Field title={field.title} value={value} onChange={onChange} numeric={field.numeric} secure={field.secure} multiline={field.multiline} disabled={busy || field.fixed} maxLength={field.maxLength} />;
}

export function OperationForm({ action, onSaved, onClose }: { action: FormAction; onSaved: (result: Row) => void; onClose: () => void }) {
  useDraftGuard();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(action.fields.map(field => [field.name, field.initial ?? ''])));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const submit = async () => {
    if (lock.current) return;
    const data: Row = {};
    for (const field of action.fields) {
      const value = field.secure ? values[field.name] ?? '' : (values[field.name] ?? '').trim();
      if (field.required && (!value || (field.checkbox && value !== 'true'))) { setError(`Vui lòng nhập/xác nhận ${field.title.toLowerCase()}.`); return; }
      if (value && ((field.minLength && value.length < field.minLength) || (field.maxLength && value.length > field.maxLength))) { setError(`${field.title} chưa đúng độ dài yêu cầu.`); return; }
      if (field.numeric && value && (!Number.isSafeInteger(Number(value)) || Number(value) < (field.minimum ?? 0) || Number(value) > (field.maximum ?? Number.MAX_SAFE_INTEGER))) { setError(`${field.title} phải là số nguyên hợp lệ.`); return; }
      if (value && field.choices && !field.choices.some(choice => choice.value === value)) { setError(`Vui lòng chọn ${field.title.toLowerCase()} hợp lệ.`); return; }
      if (!field.clientOnly) data[field.name] = field.numeric ? value ? Number(value) : undefined : field.checkbox ? value === 'true' : value || undefined;
    }
    try {
      const valuesIssue = action.validateValues?.(data);
      if (valuesIssue) { setError(valuesIssue); return; }
      const input = action.transform ? action.transform(data) : data;
      const validation = action.validate?.(input);
      if (validation) { setError(validation); return; }
      lock.current = true; setBusy(true); setError('');
      const result = await operationMutate(action.resolvePath?.(data) ?? action.path, action.method, object(input), action.idempotent); onSaved(result);
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thực hiện được thao tác.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={styles.card}><Text style={styles.title}>{action.title}</Text>{Boolean(action.description) && <Text style={styles.copy}>{action.description}</Text>}{action.fields.map(field => <Input key={field.name} field={field} value={values[field.name] ?? ''} onChange={value => setValues(current => ({ ...current, [field.name]: value }))} busy={busy} />)}{Boolean(error) && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}<Button title={busy ? 'Đang lưu…' : action.submitTitle ?? 'Lưu'} disabled={busy} onPress={() => void submit()} /><Button title="Hủy" variant="secondary" disabled={busy} onPress={onClose} /></View>;
}
