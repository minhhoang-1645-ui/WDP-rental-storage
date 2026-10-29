import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { SignaturePadHandle } from './signature-pad.types';

export const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = useRef(false), points = useRef(0);
  useImperativeHandle(ref, () => ({
    clear() { const surface = canvas.current; if (surface) surface.getContext('2d')?.clearRect(0, 0, surface.width, surface.height); points.current = 0; active.current = false; },
    async capture() {
      if (!canvas.current || points.current < 2) throw new Error('Vui lòng vẽ chữ ký trong khung.');
      return canvas.current.toDataURL('image/png');
    },
  }), []);
  return <canvas ref={canvas} width={600} height={180} aria-label="Khung vẽ chữ ký" style={{ width: '100%', height: 180, background: '#fff', border: '1px solid #81929d', borderRadius: 8, touchAction: 'none' }}
    onPointerDown={event => {
      const surface = event.currentTarget, context = surface.getContext('2d'); if (!context) return;
      surface.setPointerCapture(event.pointerId); active.current = true;
      const bounds = surface.getBoundingClientRect(); context.beginPath(); context.moveTo((event.clientX - bounds.left) * 600 / bounds.width, (event.clientY - bounds.top) * 180 / bounds.height);
      context.strokeStyle = '#213f53'; context.lineWidth = 2; context.lineCap = 'round';
    }}
    onPointerMove={event => {
      if (!active.current) return;
      const surface = event.currentTarget, bounds = surface.getBoundingClientRect(), context = surface.getContext('2d'); if (!context) return;
      context.lineTo((event.clientX - bounds.left) * 600 / bounds.width, (event.clientY - bounds.top) * 180 / bounds.height); context.stroke(); points.current++;
    }}
    onPointerUp={() => { active.current = false; }} onPointerCancel={() => { active.current = false; }} />;
});
