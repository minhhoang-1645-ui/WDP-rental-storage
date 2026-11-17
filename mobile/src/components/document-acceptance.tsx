import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { apiRequest } from '@/services/api';
import { useDraftGuard } from '@/services/live-events';
import { idOf, object, text, type Row } from '@/operations/model';
import { Button, Disclosure, Facts, Panel, styles } from '@/operations/ui';
import { SignaturePad } from './signature-pad';
import type { SignaturePadHandle } from './signature-pad.types';
import { StatusBadge } from './customer-ui';
import { formatDate } from '@/utils/format';
import { DocumentFile } from './document-file';

type Receipt = { challengeId: string; recipient: string; expiresAt: string; resendAfterSeconds: number };
export function DocumentAcceptance({ row, resource, onSaved }: { row: Row; resource: 'contracts' | 'renewals'; onSaved: () => void }) {
  const document = object(resource === 'contracts' ? row.terms : row.appendix);
  return <Acceptance key={`${resource}:${idOf(row)}:${text(document, 'snapshotHash')}`} row={row} resource={resource} document={document} onSaved={onSaved} />;
}
function Acceptance({ row, resource, document, onSaved }: { row: Row; resource: 'contracts' | 'renewals'; document: Row; onSaved: () => void }) {
  const { user } = useAuth();
  const [signing,setSigning] = useState(false);
  const pad = useRef<SignaturePadHandle>(null), lock = useRef(false);
  const [agreed, setAgreed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null), [signature, setSignature] = useState(''), [otp, setOtp] = useState(''), [remaining, setRemaining] = useState(0);
  const accepted = Boolean(document.acceptedAt), hash = text(document, 'snapshotHash'), configured = object(document.otp).emailConfigured !== false;
  const base = `/customer/${resource}/${encodeURIComponent(idOf(row))}/${resource === 'contracts' ? '' : 'appendix/'}`;
  useDraftGuard(!accepted && (signing || agreed || busy));
  useEffect(() => { if (!remaining) return; const timer = setTimeout(() => setRemaining(value => Math.max(0, value - 1)), 1000); return () => clearTimeout(timer); }, [remaining]);
  async function submit(verify: boolean) {
    if (lock.current || !agreed || !user || !hash) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const signatureImage = signature || await pad.current?.capture(); if (!signatureImage) throw new Error('Vui lòng vẽ chữ ký trước khi nhận mã.');
      const body = { agreed: true, acceptanceName: user.fullName, signatureImage, snapshotHash: hash };
      if (!verify) { const result = await apiRequest<Receipt>(`${base}signature-otp`, { method: 'POST', body: JSON.stringify(body) }); setSignature(signatureImage); setReceipt(result); setOtp(''); setRemaining(result.resendAfterSeconds); }
      else { await apiRequest(`${base}accept`, { method: 'POST', body: JSON.stringify({ ...body, challengeId: receipt?.challengeId, otp }) }); onSaved(); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể xác nhận tài liệu.'); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!hash) return <Panel title="Nội dung hợp đồng"><Text style={styles.error}>Chưa tải được tài liệu để ký. Vui lòng làm mới hồ sơ.</Text></Panel>;
  return <Panel title="Tài liệu & chữ ký">
    <StatusBadge status={accepted?'Đã ký':'Chờ bạn ký'} tone={accepted?'success':'warning'}/><Facts values={[["Người ký", document.acceptanceName || user?.fullName], ["Ngày ký", accepted ? formatDate(String(document.acceptedAt),true) : '']]} />
    <DocumentFile path={`/customer/documents/${resource}/${encodeURIComponent(idOf(row))}`} name={text(document, 'code') || text(row, 'contractCode')} title={resource==='contracts'?'Hợp đồng thuê kho':'Phụ lục gia hạn'} subtitle={[text(document,'code')||text(row,'contractCode'),accepted?'PDF · Tài liệu đã ký':'PDF · Xem nội dung trước khi ký'].filter(Boolean).join(' · ')} />
    {!accepted&&!signing&&<Button title={resource==='contracts'?'Ký hợp đồng':'Ký phụ lục'} onPress={()=>setSigning(true)}/>}
    {accepted ? <><Text style={styles.success}>Chữ ký đã được lưu trong tài liệu PDF.</Text>{text(document, 'signatureImage') && <Disclosure title="Xem chữ ký đã lưu"><Image accessibilityLabel="Chữ ký đã ghi nhận" source={{ uri: text(document, 'signatureImage') }} resizeMode="contain" style={{ width: '100%', height: 180, backgroundColor: '#fff' }} /></Disclosure>}</> : signing ? <>
      {!configured && <Text accessibilityRole="alert" style={styles.copy}>Hiện chưa thể gửi mã xác thực qua email. Bạn vẫn có thể đọc hợp đồng; vui lòng thử ký lại sau.</Text>}
      <Text style={styles.copy}>Vẽ chữ ký, đồng ý nội dung tài liệu rồi xác nhận bằng mã gửi qua email.</Text>
      {receipt ? <Image accessibilityLabel="Chữ ký chờ xác thực" source={{ uri: signature }} resizeMode="contain" style={{ height: 180, backgroundColor: '#fff' }} /> : <SignaturePad ref={pad} />}
      <Pressable accessibilityRole="button" disabled={busy} onPress={()=>{pad.current?.clear();setSignature('');setReceipt(null);setOtp('');setAgreed(false);}} style={{minHeight:44,alignSelf:'flex-start',justifyContent:'center',paddingHorizontal:4}}><Text style={{fontSize:14,fontWeight:'600',color:'#175CD3'}}>Ký lại</Text></Pressable>
      <Pressable accessibilityRole="checkbox" aria-checked={agreed} accessibilityLabel="Tôi đã đọc và đồng ý nội dung tài liệu" accessibilityState={{ checked: agreed, disabled: busy || Boolean(receipt) }} disabled={busy || Boolean(receipt)} onPress={() => setAgreed(value => !value)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={styles.copy}>{agreed ? '☑' : '☐'} Tôi đã đọc và đồng ý nội dung tài liệu này.</Text></Pressable>
      {receipt ? <View style={{ gap: 12 }}><Text accessibilityRole="alert" style={styles.copy}>Mã đã gửi đến {receipt.recipient}. Mã có hiệu lực 10 phút, tối đa 5 lần nhập sai. Chữ ký chưa được lưu.</Text><Text style={styles.label}>Mã xác thực 6 số</Text><TextInput accessibilityLabel="Mã xác thực chữ ký" value={otp} onChangeText={value => setOtp(value.replace(/\D/g, ''))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} editable={!busy} style={{ minHeight: 50, borderWidth: 1, borderColor: '#cbd7df', borderRadius: 10, padding: 12, fontSize: 22, backgroundColor: '#fff' }} /><Button title={busy ? 'Đang xác thực…' : 'Xác thực và ký tài liệu'} disabled={busy || otp.length !== 6} onPress={() => void submit(true)} /><Button title={remaining ? `Gửi lại sau ${remaining}s` : 'Gửi lại mã'} variant="secondary" disabled={busy || remaining > 0} onPress={() => void submit(false)} /></View> : <Button title={busy ? 'Đang gửi mã…' : remaining ? `Gửi lại sau ${remaining}s` : 'Gửi mã xác thực qua email'} disabled={!agreed || busy || !configured || remaining > 0} onPress={() => void submit(false)} />}
    </> : null}
    {document.version != null && <Disclosure title="Phiên bản tài liệu"><Text style={styles.copy}>{String(document.version)}</Text></Disclosure>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </Panel>;
}
