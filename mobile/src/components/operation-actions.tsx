import { useRef, useState } from 'react';
import { Text } from 'react-native';

import { ActionButton, Field, Panel, portalStyles } from '@/components/portal-ui';
import { apiRequest } from '@/services/api';
import { actionsFor, type OperationAction } from '@/services/operation-actions';
import type { OperationRecord } from '@/types/management';

export function OperationActions({ resource, id, data, onSuccess, disabled }: { resource: string; id: string; data: OperationRecord; onSuccess: () => void; disabled: boolean }) {
  const actions = actionsFor(resource, data);
  const [selected, setSelected] = useState<OperationAction | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const lock = useRef(false);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const stillAllowed = selected && actions.some(action => action.suffix === selected.suffix && action.label === selected.label);

  async function submit() {
    if (!selected || !stillAllowed || disabled || lock.current || (selected.input?.required && !draft.trim())) return;
    const body = { ...selected.body, ...(selected.input ? { [selected.input.key]: draft.trim() } : {}) };
    const signature = JSON.stringify({ resource, id, suffix: selected.suffix, body });
    // Reuse the key after a lost response. A different draft is a different operation.
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    lock.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/manager/${resource}/${encodeURIComponent(id)}/${selected.suffix}`, {
        method: selected.method,
        headers: selected.idempotent ? { 'Idempotency-Key': attempt.current.key } : undefined,
        body: JSON.stringify(body),
      });
      setSuccess('Đã cập nhật hồ sơ thành công.');
      setSelected(null);
      setDraft('');
      attempt.current = null;
      onSuccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa thể cập nhật hồ sơ. Vui lòng thử lại.');
    } finally { lock.current = false; setBusy(false); }
  }

  if (!actions.length && !success && !selected) return null;
  return <Panel title="Xử lý hồ sơ">
    {success ? <Text selectable style={portalStyles.success}>{success}</Text> : null}
    {actions.map(action => <ActionButton key={action.label} label={action.label} secondary disabled={disabled || busy} onPress={() => { setSelected(action); setDraft(''); setError(''); setSuccess(''); }} />)}
    {selected ? <>
      <Text style={portalStyles.title}>{selected.label}</Text>
      <Text style={portalStyles.text}>{selected.explanation}</Text>
      {selected.input ? <Field key={selected.label} label={selected.input.label} defaultValue={draft} onChangeText={setDraft} editable={!busy} multiline maxLength={selected.input.key === 'reference' ? 200 : 1000} /> : null}
      {!stillAllowed ? <Text style={portalStyles.error}>Trạng thái hồ sơ đã thay đổi. Vui lòng tải lại trước khi xử lý.</Text> : null}
      {error ? <Text selectable style={portalStyles.error}>{error}</Text> : null}
      <ActionButton label={busy ? 'Đang xử lý…' : 'Xác nhận thực hiện'} disabled={disabled || busy || !stillAllowed || Boolean(selected.input?.required && !draft.trim())} onPress={() => void submit()} />
      <ActionButton label="Đóng" secondary disabled={busy} onPress={() => setSelected(null)} />
    </> : null}
  </Panel>;
}
