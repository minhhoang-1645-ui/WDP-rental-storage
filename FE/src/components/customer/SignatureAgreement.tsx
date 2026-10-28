import { useRef, useState, type PointerEvent } from 'react';

export function SignatureAgreement({ busy, onSubmit, label = 'Xác nhận' }: { busy: boolean; onSubmit: (signatureImage: string) => void; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const element = event.currentTarget, rect = element.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * element.width / rect.width, y: (event.clientY - rect.top) * element.height / rect.height };
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
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
    <label className="portal-checkbox"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /> Tôi đã đọc và đồng ý với nội dung trên.</label>
    <p>Vẽ chữ ký bằng chuột hoặc ngón tay:</p>
    <canvas ref={canvas} width={600} height={180} aria-label="Ô vẽ chữ ký" style={{ width: '100%', maxWidth: 600, height: 180, border: '1px solid #aab9c8', borderRadius: 8, background: '#fff', touchAction: 'none' }} onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
      <button type="button" className="button-secondary" onClick={() => { const element = canvas.current; element?.getContext('2d')?.clearRect(0, 0, element.width, element.height); setSigned(false); }}>Xóa và ký lại</button>
      <button type="button" className="button-primary" disabled={!agreed || !signed || busy} onClick={() => { const image = canvas.current?.toDataURL('image/png'); if (image) onSubmit(image); }}>{busy ? 'Đang lưu…' : label}</button>
    </div>
  </div>;
}
