import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { Camera, ImagePlus } from 'lucide-react';
import './evidence-photo-field.css';

type Props = {
  label: string;
  accept: string;
  count: number;
  limit: number;
  help: string;
  disabled?: boolean;
  reading?: boolean;
  error?: string;
  onSelect: (event: ChangeEvent<HTMLInputElement>, fromCamera: boolean) => void;
  children?: ReactNode;
};

export function EvidencePhotoField({ label, accept, count, limit, help, disabled, reading, error, onSelect, children }: Props) {
  const file = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const locked = disabled || reading || count >= limit;
  return <div className="evidence-photo-field" role="group" aria-label={label}>
    <div className="evidence-photo-heading">
      <strong>{label}</strong>
      <span className="evidence-photo-count" role="status">{reading ? 'Đang đọc ảnh…' : `${count}/${limit} ảnh`}</span>
    </div>
    <div className="evidence-photo-controls">
      <input ref={file} hidden aria-label={label} type="file" accept={accept} multiple disabled={locked} onChange={event => onSelect(event, false)} />
      <input ref={camera} hidden aria-label="Chụp ảnh bằng camera" type="file" accept={accept} capture="environment" disabled={locked} onChange={event => onSelect(event, true)} />
      <button type="button" className="evidence-photo-action" disabled={locked} onClick={() => file.current?.click()}>
        <ImagePlus size={19} aria-hidden="true" /> Chọn ảnh
      </button>
      <button type="button" className="evidence-photo-action" disabled={locked} onClick={() => camera.current?.click()}>
        <Camera size={19} aria-hidden="true" /> Chụp ảnh
      </button>
    </div>
    <small className="evidence-photo-help">{help}</small>
    {error && <p className="booking-alert is-error" role="alert">{error}</p>}
    {children}
  </div>;
}
