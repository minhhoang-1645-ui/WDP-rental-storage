import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { object, type Row } from './model';
import { Button, Field, styles } from './ui';
import { operationMutate } from './mutate';
import { useResource } from './use-resource';

export interface FormField { name: string; title: string; required?: boolean; minLength?: number; maxLength?: number; numeric?: boolean; minimum?: number; maximum?: number; initial?: string; fixed?: boolean; secure?: boolean; multiline?: boolean; choices?: { value: string; label: string }[]; optionsPath?: string; optionsAccept?: (row: Row) => boolean; optionLabel?: (row: Row) => string; checkbox?: boolean; clientOnly?: boolean }
export interface FormAction { title: string; path: string; method: 'POST' | 'PATCH'; fields: FormField[]; idempotent?: boolean; description?: string; submitTitle?: string; transform?: (input: Row) => Row; validateValues?: (input: Row) => string | undefined; validate?: (input: Row) => string | undefined }

function Input({ field, value, onChange, busy }: { field: FormField; value: string; onChange: (value: string) => void; busy: boolean }) {
  const resource = useResource<{ items: Row[] }>(field.optionsPath ?? null, true);
  const choices = field.choices ?? resource.data?.items.filter(row => !field.optionsAccept || field.optionsAccept(row)).map(row => ({ value: String(row.id ?? ''), label: field.optionLabel?.(row) ?? String(row.fullName ?? row.contractCode ?? row.unitCode ?? row.id) }));
  if (field.checkbox) return <Button variant={value === 'true' ? 'primary' : 'secondary'} title={`${value === 'true' ? '✓ ' : '□ '}${field.title}`} disabled={busy} onPress={() => onChange(value === 'true' ? 'false' : 'true')} />;
  if (choices || field.optionsPath) return <View style={{ gap: 8 }}><Text style={styles.label}>{field.title}</Text>{Boolean(resource.error) && <Text style={styles.error}>{resource.error}</Text>}{resource.loading ? <Text style={styles.copy}>Đang tải lựa chọn…</Text> : <View style={styles.row}>{!field.required && <Button variant={!value ? 'primary' : 'secondary'} title={!value ? '✓ Không chọn' : 'Không chọn'} disabled={busy} onPress={() => onChange('')} />}{choices?.map(choice => <Button key={choice.value} variant={value === choice.value ? 'primary' : 'secondary'} title={`${value === choice.value ? '✓ ' : ''}${choice.label}`} disabled={busy || field.fixed} onPress={() => onChange(choice.value)} />)}{choices?.length === 0 && <Text style={styles.copy}>Không có lựa chọn phù hợp.</Text>}</View>}</View>;
  return <Field title={field.title} value={value} onChange={onChange} numeric={field.numeric} secure={field.secure} multiline={field.multiline} disabled={busy || field.fixed} maxLength={field.maxLength} />;
}

export function OperationForm({ action, onSaved, onClose }: { action: FormAction; onSaved: (result: Row) => void; onClose: () => void }) {
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
      const result = await operationMutate(action.path, action.method, object(input), action.idempotent); onSaved(result);
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thực hiện được thao tác.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={styles.card}><Text style={styles.title}>{action.title}</Text>{Boolean(action.description) && <Text style={styles.copy}>{action.description}</Text>}{action.fields.map(field => <Input key={field.name} field={field} value={values[field.name] ?? ''} onChange={value => setValues(current => ({ ...current, [field.name]: value }))} busy={busy} />)}{Boolean(error) && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}<Button title={busy ? 'Đang lưu…' : action.submitTitle ?? 'Lưu'} disabled={busy} onPress={() => void submit()} /><Button title="Hủy" variant="secondary" disabled={busy} onPress={onClose} /></View>;
}
