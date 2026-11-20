import { useEffect, useRef, useState, type PointerEvent } from 'react';

export type OtpReceipt = { challengeId: string; recipient: string; expiresAt: string; resendAfterSeconds: number };
export type OtpProof = { challengeId: string; otp: string };
export function SignatureAgreement({ busy, onSubmit, onRequestOtp, otpConfigured = true, label = 'Xác nhận' }: { busy: boolean; onSubmit: (signatureImage: string, proof: OtpProof) => Promise<void>; onRequestOtp: (signatureImage: string) => Promise<OtpReceipt>; otpConfigured?: boolean; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false), lock = useRef(false);
  const [receipt, setReceipt] = useState<OtpReceipt | null>(null), [image, setImage] = useState(''), [otp, setOtp] = useState(''), [error, setError] = useState(''), [sending, setSending] = useState(false), [remaining, setRemaining] = useState(0);
  useEffect(() => { if (!remaining) return; const timer = window.setTimeout(() => setRemaining(value => Math.max(0, value - 1)), 1000); return () => window.clearTimeout(timer); }, [remaining]);
  async function send() {
    if (lock.current || busy) return;
    const signature = image || canvas.current?.toDataURL('image/png'); if (!signature) return;
    lock.current = true; setSending(true); setError('');
    try { const result = await onRequestOtp(signature); setImage(signature); setReceipt(result); setOtp(''); setRemaining(result.resendAfterSeconds); }
    catch (error) { setError(error instanceof Error ? error.message : 'Chưa gửi được mã xác thực.'); }
    finally { lock.current = false; setSending(false); }
  }
  async function confirm() {
    if (!receipt || lock.current || busy) return;
    lock.current = true; setSending(true); setError('');
    try { await onSubmit(image, { challengeId: receipt.challengeId, otp }); }
    catch (error) { setError(error instanceof Error ? error.message : 'Chưa lưu được chữ ký.'); }
    finally { lock.current = false; setSending(false); }
  }
  const [signed, setSigned] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const element = event.currentTarget, rect = element.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * element.width / rect.width, y: (event.clientY - rect.top) * element.height / rect.height };
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (receipt || sending || busy) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext('2d'); if (!context) return;
    const { x, y } = point(event); context.beginPath(); context.moveTo(x, y); context.strokeStyle = '#172f50'; context.lineWidth = 2.5; context.lineCap = 'round'; context.lineJoin = 'round'; drawing.current = true;
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    event.preventDefault(); const { x, y } = point(event); const context = event.currentTarget.getContext('2d');
    context?.lineTo(x, y); context?.stroke(); setSigned(true);
  };
  return <div className="customer-panel" style={{ marginTop: 16 }}>
    <label className="portal-checkbox"><input type="checkbox" disabled={Boolean(receipt) || sending || busy} checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /> Tôi đã đọc và đồng ý với nội dung trên.</label>
    {!otpConfigured && <p role="status" className="activity-update-note">Cơ sở chưa cấu hình email xác thực chữ ký. Bạn có thể xem / tải tài liệu; việc ký và thanh toán sẽ mở sau khi cấu hình xong.</p>}
    <p>1. Đọc file PDF ở trên và đồng ý nội dung. 2. Vẽ chữ ký. 3. Nhận mã qua email rồi xác nhận.</p>
    <canvas ref={canvas} width={600} height={180} aria-label="Ô vẽ chữ ký" style={{ width: '100%', maxWidth: 600, height: 180, border: '1px solid #aab9c8', borderRadius: 8, background: '#fff', touchAction: 'none' }} onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
      <button type="button" className="button-secondary" disabled={busy || sending} onClick={() => { setReceipt(null); setImage(''); setOtp(''); setError(''); const element = canvas.current; element?.getContext('2d')?.clearRect(0, 0, element.width, element.height); setSigned(false); }}>Xóa và ký lại</button>
      {!receipt && <button type="button" className="button-primary" disabled={!agreed || !signed || busy || sending || !otpConfigured || remaining > 0} onClick={() => void send()}>{sending ? 'Đang gửi mã…' : remaining > 0 ? `Gửi lại sau ${remaining}s` : 'Gửi mã xác thực qua email'}</button>}
    </div>
    {receipt && <div className="signature-otp"><p role="status">Mã đã gửi đến <strong>{receipt.recipient}</strong>. Có hiệu lực 10 phút, tối đa 5 lần nhập sai. Chữ ký chưa được lưu cho đến khi xác thực thành công.</p><label className="field-label">Mã xác thực 6 số<input aria-label="Mã xác thực chữ ký" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} disabled={busy || sending} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} /></label><button type="button" className="button-primary" disabled={otp.length !== 6 || busy || sending} onClick={() => void confirm()}>{busy || sending ? 'Đang xác thực…' : label}</button><button type="button" className="portal-text-button" disabled={remaining > 0 || sending || busy} onClick={() => void send()}>{remaining > 0 ? `Gửi lại mã sau ${remaining}s` : 'Gửi lại mã'}</button></div>}
    {error && <p role="alert" className="portal-error">{error}</p>}
  </div>;
}
