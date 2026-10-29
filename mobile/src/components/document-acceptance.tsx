import { documentLabels, documentText } from '@/utils/document-display';
import { serviceDisplayName } from '@/utils/service-labels';
import { PriceBreakdown } from './price-breakdown';
import { useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { apiRequest } from '@/services/api';
import { useDraftGuard } from '@/services/live-events';
import { idOf, object, text, type Row } from '@/operations/model';
import { Button, Facts, Panel, styles } from '@/operations/ui';
import { SignaturePad } from './signature-pad';
import type { SignaturePadHandle } from './signature-pad.types';

function Snapshot({ value, field='' }: { value: unknown; field?:string }) {
  if (value === null || value === undefined) return <Text style={styles.copy}>—</Text>;
  if (Array.isArray(value)) return <View style={{ gap: 8 }}>{value.length ? value.map((item, i) => <Snapshot key={i} value={item} />) : <Text style={styles.copy}>Không có</Text>}</View>;
  if (typeof value !== 'object') return <Text selectable style={styles.copy}>{documentText(field,value)}</Text>;
  const row=value as Row;
  if (Array.isArray(row.lineItems) && typeof row.quotedTotalAmount==='number') return <PriceBreakdown quote={row} />;
  return <View style={{ gap: 8 }}>{Object.entries(row).filter(([key,item])=>item!==null && item!==undefined && !['storageTypeId','serviceId'].includes(key)).map(([key, item]) => <View key={key} style={{ gap: 4, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: '#dbe4e8' }}><Text style={styles.label}>{documentLabels[key] || key}</Text><Snapshot field={key} value={key==='name'&&typeof item==='string'?serviceDisplayName(String(row.code??''),item):item} /></View>)}</View>;
}
export function DocumentAcceptance({ row, resource, onSaved }: { row: Row; resource: 'contracts' | 'renewals'; onSaved: () => void }) {
  const document = object(resource === 'contracts' ? row.terms : row.appendix);
  return <Acceptance key={`${resource}:${idOf(row)}:${text(document, 'snapshotHash')}`} row={row} resource={resource} document={document} onSaved={onSaved} />;
}
function Acceptance({ row, resource, document, onSaved }: { row: Row; resource: 'contracts' | 'renewals'; document: Row; onSaved: () => void }) {
  const { user } = useAuth();
  const pad = useRef<SignaturePadHandle>(null), lock = useRef(false);
  const [agreed, setAgreed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const accepted = Boolean(document.acceptedAt), hash = text(document, 'snapshotHash');
  useDraftGuard(!accepted && (agreed || busy));
  const submit = async () => {
    if (lock.current || !agreed || !user || !hash) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const signatureImage = await pad.current?.capture(); if (!signatureImage) throw new Error('Chưa đọc được chữ ký.');
      await apiRequest(`/customer/${resource}/${encodeURIComponent(idOf(row))}/${resource === 'contracts' ? 'accept' : 'appendix/accept'}`, { method: 'POST', body: JSON.stringify({ agreed: true, acceptanceName: user.fullName, signatureImage, snapshotHash: hash }) });
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể xác nhận tài liệu.'); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!hash) return <Panel title="Nội dung hợp đồng"><Text style={styles.error}>Chưa tải được tài liệu để ký. Vui lòng làm mới hồ sơ.</Text></Panel>;
  return <Panel title={resource === 'contracts' ? 'Hợp đồng và chữ ký của bạn' : 'Phụ lục gia hạn và chữ ký'}>
    <Facts values={[["Phiên bản", document.version], ["Người ký", document.acceptanceName || user?.fullName], ["Trạng thái", accepted ? 'Đã ký' : 'Chờ bạn đọc và ký']]} />
    <Snapshot value={document.document ?? document.snapshot} />
    {accepted ? <><Text style={styles.success}>Đã ghi nhận chữ ký: {documentText('acceptedAt', document.acceptedAt)}</Text>{text(document, 'signatureImage') && <Image accessibilityLabel="Chữ ký đã ghi nhận" source={{ uri: text(document, 'signatureImage') }} resizeMode="contain" style={{ width: '100%', height: 180, backgroundColor: '#fff' }} />}</> : <>
      <Text style={styles.copy}>Đọc nội dung phía trên, vẽ chữ ký và xác nhận trước khi thanh toán.</Text>
      <SignaturePad ref={pad} />
      <Button title="Xóa chữ ký để ký lại" variant="secondary" disabled={busy} onPress={() => pad.current?.clear()} />
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Tôi đã đọc và đồng ý nội dung tài liệu" accessibilityState={{ checked: agreed, disabled: busy }} disabled={busy} onPress={() => setAgreed(value => !value)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={styles.copy}>{agreed ? '☑' : '☐'} Tôi đã đọc và đồng ý nội dung tài liệu này.</Text></Pressable>
      <Button title={busy ? 'Đang ghi nhận chữ ký…' : 'Ký và xác nhận tài liệu'} disabled={!agreed || busy} onPress={() => void submit()} />
    </>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </Panel>;
}
