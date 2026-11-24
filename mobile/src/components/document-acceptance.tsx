import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { apiRequest } from '@/services/api';
import { useDraftGuard } from '@/services/live-events';
import { idOf, object, text, type Row } from '@/operations/model';
import { Button, Disclosure, Facts, Navigation, Panel, styles } from '@/operations/ui';
import { SignaturePad } from './signature-pad';
import type { SignaturePadHandle } from './signature-pad.types';
import { StatusBadge } from './customer-ui';
import { formatDate } from '@/utils/format';
import { CustomerTransferDocument } from './customer-transfer-document';

type Receipt = { challengeId: string; recipient: string; expiresAt: string; resendAfterSeconds: number };
export function DocumentAcceptance({ row, resource, onSaved }: { row: Row; resource: 'contracts' | 'renewals' | 'transfer-orders'; onSaved: () => void }) {
  const document = object(resource === 'contracts' ? row.terms : resource === 'transfer-orders' ? row.commercial : row.appendix);
  return <Acceptance key={`${resource}:${idOf(row)}:${text(document, 'snapshotHash')}`} row={row} resource={resource} document={document} onSaved={onSaved} />;
}
function Acceptance({ row, resource, document, onSaved }: { row: Row; resource: 'contracts' | 'renewals' | 'transfer-orders'; document: Row; onSaved: () => void }) {
  const { user } = useAuth();
  const [signing,setSigning] = useState(false);
  const pad = useRef<SignaturePadHandle>(null), lock = useRef(false);
  const [agreed, setAgreed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null), [signature, setSignature] = useState(''), [otp, setOtp] = useState(''), [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const expiration = receipt ? Date.parse(receipt.expiresAt) : 0;
  const expiresIn = Number.isFinite(expiration) ? Math.max(0, Math.ceil((expiration - now) / 1000)) : 0;
  const [reviewed, setReviewed] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const transfer = resource === 'transfer-orders';
  const content = object(row.addendumContent);
  const contentReady = Boolean(text(content, 'code') && Array.isArray(content.sections) && content.sections.length);
  const maySign = !transfer || (row.status === 'APPROVED' && contentReady && reviewed && hasSignature);
  const accepted = Boolean(document.acceptedAt), hash = text(document, 'snapshotHash'), configured = object(document.otp).emailConfigured !== false;
  const base = `/customer/${resource}/${encodeURIComponent(idOf(row))}/${resource === 'renewals' ? 'appendix/' : ''}`;
  useDraftGuard(!accepted && (signing || agreed || busy));
  useEffect(() => { if (!remaining && !expiresIn) return; const timer = setTimeout(() => setNow(Date.now()), 1000); return () => clearTimeout(timer); }, [remaining, expiresIn, now]);
  async function submit(verify: boolean) {
    if (lock.current || !agreed || !user || !hash || accepted || !maySign || (verify ? !receipt || otp.length !== 6 || !(expiration > Date.now()) : !configured || Date.now() < resendAt)) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const signatureImage = signature || await pad.current?.capture(); if (!signatureImage) throw new Error('Vui lòng vẽ chữ ký trước khi nhận mã.');
      const body = { agreed: true, acceptanceName: user.fullName, signatureImage, snapshotHash: hash };
      if (!verify) { const result = await apiRequest<Receipt>(`${base}signature-otp`, { method: 'POST', body: JSON.stringify(body) }); if (!result.challengeId || !Number.isFinite(Date.parse(result.expiresAt)) || !Number.isFinite(result.resendAfterSeconds)) {
          throw new Error('Chưa nhận được thông tin xác thực. Vui lòng thử lại.');
        }
        const sentAt = Date.now();
        setSignature(signatureImage); setReceipt(result); setOtp(''); setResendAt(sentAt + result.resendAfterSeconds * 1000); setNow(sentAt); }
      else { await apiRequest(`${base}accept`, { method: 'POST', body: JSON.stringify({ ...body, challengeId: receipt?.challengeId, otp }) }); onSaved(); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể xác nhận tài liệu.'); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!hash) return <Panel title="Nội dung hợp đồng"><Text style={styles.error}>Chưa tải được tài liệu để ký. Vui lòng làm mới hồ sơ.</Text></Panel>;
  if (transfer && !contentReady) return <Panel title="Phụ lục chuyển kho"><Text accessibilityRole="alert" style={styles.error}>Chưa tải được nội dung phụ lục. Hãy thử làm mới trước khi ký.</Text></Panel>;
  const consent = transfer ? 'Tôi đã đọc và đồng ý với nội dung phụ lục.' : 'Tôi đã đọc và đồng ý nội dung tài liệu này.';
  return <Panel title={transfer ? 'Phụ lục chuyển kho' : 'Tài liệu & chữ ký'}>
    {(!transfer || (receipt && !accepted)) && <StatusBadge status={accepted ? 'Đã ký' : receipt && transfer ? 'Đang xác thực' : 'Chờ bạn ký'} tone={accepted?'success':'warning'}/>}
    {(!transfer || accepted) && <Facts values={[["Người ký", document.acceptanceName || user?.fullName], ["Ngày ký", accepted ? formatDate(String(document.acceptedAt),true) : '']]} />}
    {resource === 'contracts' ? <Navigation title="Xem hợp đồng" path={'/customer/contract-document?id=' + encodeURIComponent(idOf(row))} />
      : resource === 'renewals' ? <Navigation title="Xem phụ lục gia hạn" path={'/customer/contract-document?renewalId=' + encodeURIComponent(idOf(row))} />
      : <CustomerTransferDocument content={content} terms={document} onReviewed={() => { setReviewed(true); setSigning(true); }} />}
    {!transfer&&!accepted&&!signing&&<Button title={resource==='contracts'?'Ký hợp đồng':'Ký phụ lục'} onPress={()=>setSigning(true)}/>}
    {accepted ? !transfer && <><Text style={styles.success}>Chữ ký đã được lưu trong tài liệu.</Text>{text(document, 'signatureImage') && <Disclosure title="Xem chữ ký đã lưu"><Image accessibilityLabel="Chữ ký đã ghi nhận" source={{ uri: text(document, 'signatureImage') }} resizeMode="contain" style={{ width: '100%', height: 180, backgroundColor: '#fff' }} /></Disclosure>}</> : signing ? <>
      {!configured && <Text accessibilityRole="alert" style={styles.copy}>Hiện chưa thể gửi mã xác thực qua email. Bạn vẫn có thể xem hợp đồng; vui lòng thử ký lại sau.</Text>}
      {!transfer && <Text style={styles.copy}>Vẽ chữ ký, đồng ý nội dung tài liệu rồi xác nhận bằng mã gửi qua email.</Text>}
      {receipt ? <Image accessibilityLabel="Chữ ký chờ xác thực" source={{ uri: signature }} resizeMode="contain" style={{ height: 180, backgroundColor: '#fff' }} /> : <SignaturePad ref={pad} compact={transfer} onValidityChange={transfer ? setHasSignature : undefined} />}
      <Pressable accessibilityRole="button" disabled={busy} onPress={()=>{pad.current?.clear();setSignature('');setReceipt(null);setOtp('');setAgreed(false);setHasSignature(false);}} style={{minHeight:44,alignSelf:'flex-start',justifyContent:'center',paddingHorizontal:4}}><Text style={{fontSize:14,fontWeight:'600',color:'#175CD3'}}>{transfer ? 'Xóa chữ ký' : 'Ký lại'}</Text></Pressable>
      <Pressable accessibilityRole="checkbox" aria-checked={agreed} accessibilityLabel={consent} accessibilityState={{ checked: agreed, disabled: busy || Boolean(receipt) || (transfer && !reviewed) }} disabled={busy || Boolean(receipt) || (transfer && !reviewed)} onPress={() => setAgreed(value => !value)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={styles.copy}>{agreed ? '☑' : '☐'} {consent}</Text></Pressable>
      {receipt ? <View style={{ gap: 12 }}><Text accessibilityRole="alert" style={styles.copy}>Mã đã gửi đến {receipt.recipient}. {expiresIn ? 'Mã hết hạn sau ' + Math.floor(expiresIn / 60) + ':' + String(expiresIn % 60).padStart(2, '0') + '.' : 'Mã đã hết hạn. Hãy gửi mã mới.'} Chữ ký chưa được lưu.</Text><Text style={styles.label}>Mã xác thực 6 số</Text><TextInput accessibilityLabel="Mã xác thực chữ ký" value={otp} onChangeText={value => setOtp(value.replace(/\D/g, ''))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} editable={!busy && expiresIn > 0} style={{ minHeight: 50, borderWidth: 1, borderColor: '#cbd7df', borderRadius: 10, padding: 12, fontSize: 22, backgroundColor: '#fff' }} /><Button title={busy ? 'Đang xác thực…' : 'Xác thực và ký tài liệu'} disabled={busy || expiresIn === 0 || otp.length !== 6} onPress={() => void submit(true)} /><Button title={remaining ? `Gửi lại sau ${remaining}s` : 'Gửi lại mã'} variant="secondary" disabled={busy || !configured || remaining > 0} onPress={() => void submit(false)} /></View> : <Button title={busy ? 'Đang gửi mã…' : remaining ? `Gửi lại sau ${remaining}s` : transfer ? 'Gửi mã xác thực' : 'Gửi mã xác thực qua email'} disabled={!agreed || !maySign || busy || !configured || remaining > 0} onPress={() => void submit(false)} />}
    </> : null}
    {document.version != null && <Disclosure title="Phiên bản tài liệu"><Text style={styles.copy}>{String(document.version)}</Text></Disclosure>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </Panel>;
}
