import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { code, type Row } from '../manager/portal-data';
import { recordIdentity } from '../../utils/record-identity';

export function CopyRecordCode({ value, label = 'Mã hồ sơ' }: { value: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  if (!value) return null;
  return <span className="record-code"><span>{label}: <span className="record-code-value">{value}</span></span><button type="button" className="record-copy" aria-label={`Sao chép ${label.toLocaleLowerCase('vi')} ${value}`} title="Sao chép mã" onClick={async () => { try { await navigator.clipboard.writeText(value); setState('copied'); } catch { setState('failed'); } }}>{state === 'copied' ? <Check size={15} /> : <Copy size={15} />}</button>{state !== 'idle' && <small role="status">{state === 'copied' ? 'Đã sao chép' : 'Hãy chọn mã để sao chép.'}</small>}</span>;
}
export function RecordIdentity({ row, resource, showPerson = false, showCode = true, showCreated = false }: { row: object; resource: string; showPerson?: boolean; showCode?: boolean; showCreated?: boolean }) {
  const identity = recordIdentity(row as Row, resource);
  return <div className="record-identity"><strong>{showPerson && identity.person ? identity.person : identity.title}</strong>{showPerson && identity.person && <span>{identity.title}</span>}<span>{[identity.quantity, identity.period].filter(Boolean).join(' · ')}</span>{identity.location && !identity.title.includes(identity.location) && <span>Kho: {identity.location}</span>}{showCreated && identity.created && <span>Tạo lúc {identity.created}</span>}{showCode && <CopyRecordCode value={code(row as Row)} />}</div>;
}
