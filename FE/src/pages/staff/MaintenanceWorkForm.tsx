import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FilePlus, X } from 'lucide-react';
import { EvidencePhotoField } from '../../components/workspace/EvidencePhotoField';
import { apiRequest } from '../../services/api';
import { markFormDirty } from '../../services/live-events';
import type { Row } from '../../components/manager/portal-data';

const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];
const receiptTypes = ['image/jpeg', 'image/png', 'application/pdf'];
const maxFileBytes = 5 * 1024 * 1024;
type PickedFile = { id: string; file: File; preview?: string };

export function MaintenanceWorkForm({ path, onSaved, onError }: {
  path: string; onSaved: (row: Row) => void; onError: (error: unknown) => void;
}) {
  const previews = useRef(new Map<string, string>());
  const lock = useRef(false);
  const retry = useRef<{ signature: string; key: string } | undefined>(undefined);
  const receiptInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PickedFile[]>([]);
  const [receipts, setReceipts] = useState<PickedFile[]>([]);
  const [selectionError, setSelectionError] = useState<{ group: 'photos' | 'receipts'; message: string }>();
  const [progress, setProgress] = useState<number | null>();
  const busy = progress !== undefined;
  useEffect(() => {
    const urls = previews.current;
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);

  function pick(files: FileList | null, group: 'photos' | 'receipts', form: HTMLFormElement | null) {
    const selection = Array.from(files ?? []);
    if (!selection.length || lock.current) return;
    const images = group === 'photos';
    const selected = images ? photos : receipts;
    const types = images ? photoTypes : receiptTypes;
    const limit = images ? 3 : 5;
    const invalidType = selection.find(file => !types.includes(file.type));
    const invalidSize = selection.find(file => !file.size || file.size > maxFileBytes);
    const message = selected.length + selection.length > limit ? `Chỉ được chọn tối đa ${limit} tệp.`
      : invalidType ? `Tệp “${invalidType.name}” không đúng định dạng.`
      : invalidSize ? `Tệp “${invalidSize.name}” phải có dung lượng lớn hơn 0 và không quá 5 MB.`
      : [...photos, ...receipts].reduce((total, item) => total + item.file.size, 0)
        + selection.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024 ? 'Tổng dung lượng không quá 20 MB.' : '';
    if (message) { setSelectionError({ group, message }); return; }
    const next = selection.map(file => {
      const id = crypto.randomUUID();
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      if (preview) previews.current.set(id, preview);
      return { id, file, preview };
    });
    (images ? setPhotos : setReceipts)([...selected, ...next]);
    setSelectionError(undefined);
    if (form) markFormDirty(form);
  }

  function remove(id: string, group: 'photos' | 'receipts', form: HTMLFormElement | null) {
    const preview = previews.current.get(id);
    if (preview) URL.revokeObjectURL(preview);
    previews.current.delete(id);
    (group === 'photos' ? setPhotos : setReceipts)(items => items.filter(item => item.id !== id));
    setSelectionError(undefined);
    if (form) markFormDirty(form);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const signature = JSON.stringify([fields.get('workNote'), fields.get('actualCostVnd'), photos.map(item => item.id), receipts.map(item => item.id)]);
    if (retry.current?.signature !== signature) retry.current = { signature, key: 'portal-' + crypto.randomUUID() };
    for (const item of photos) fields.append('photos', item.file);
    for (const item of receipts) fields.append('receipts', item.file);
    lock.current = true;
    form.dataset.wdpSubmitting = 'true';
    setProgress(fields.has('photos') || fields.has('receipts') ? 0 : null);
    try {
      const result = await apiRequest<Row>(path, {
        method: 'POST', body: fields, headers: { 'Idempotency-Key': retry.current.key },
        timeoutMs: 120_000, onUploadProgress: setProgress,
      });
      onSaved(result);
    } catch (error) {
      onError(error);
    } finally {
      lock.current = false;
      form.removeAttribute('data-wdp-submitting');
      setProgress(undefined);
    }
  }

  function fileList(items: PickedFile[], group: 'photos' | 'receipts') {
    return items.length > 0 && <ul className="evidence-photo-previews" aria-label={group === 'photos' ? 'Ảnh đã chọn' : 'Chứng từ đã chọn'}>
      {items.map(item => <li key={item.id}>
        {item.preview && <img src={item.preview} alt={item.file.name} />}
        <span title={item.file.name}>{item.file.name}</span>
        <button className="button-secondary" type="button" disabled={busy} aria-label={`Xóa ${item.file.name}`}
          onClick={event => remove(item.id, group, event.currentTarget.form)}><X size={15} aria-hidden="true" /> Xóa</button>
      </li>)}
    </ul>;
  }

  return <form className="portal-form staff-maintenance-result" onSubmit={event => void submit(event)}>
    <label className="field-label">Công việc đã thực hiện
      <textarea name="workNote" required minLength={3} maxLength={4000} rows={3}
        readOnly={busy} placeholder="Ghi lại việc đã kiểm tra hoặc sửa chữa và tình trạng hiện tại." />
    </label>
    <EvidencePhotoField label="Ảnh kết quả sửa chữa (tùy chọn)" accept={photoTypes.join(',')} count={photos.length} limit={3}
      help="JPG, PNG hoặc WebP · Tối đa 5 MB mỗi ảnh" disabled={busy}
      error={selectionError?.group === 'photos' ? selectionError.message : undefined}
      onSelect={event => { pick(event.currentTarget.files, 'photos', event.currentTarget.form); event.currentTarget.value = ''; }}>
      {fileList(photos, 'photos')}
    </EvidencePhotoField>
    <label className="field-label">Chi phí của lần sửa này (VND)
      <input name="actualCostVnd" inputMode="numeric" pattern="[0-9]{1,18}" maxLength={18} placeholder="Chưa xác định" readOnly={busy} />
      <small>Để trống nếu chưa rõ, nhập 0 nếu không phát sinh.</small>
    </label>
    <div className="evidence-photo-field" role="group" aria-label="Chứng từ (tùy chọn)">
      <div className="evidence-photo-heading"><strong>Chứng từ (tùy chọn)</strong><span className="evidence-photo-count">{receipts.length}/5 tệp</span></div>
      <input ref={receiptInput} type="file" hidden multiple accept={receiptTypes.join(',')} aria-label="Chứng từ (tùy chọn)" disabled={busy}
        onChange={event => { pick(event.currentTarget.files, 'receipts', event.currentTarget.form); event.currentTarget.value = ''; }} />
      <div className="evidence-photo-controls"><button className="evidence-photo-action" type="button" disabled={busy || receipts.length >= 5}
        onClick={() => receiptInput.current?.click()}><FilePlus size={18} aria-hidden="true" /> Chọn chứng từ</button></div>
      <small className="evidence-photo-help">JPG, PNG hoặc PDF · Tối đa 5 MB mỗi tệp · Tổng ảnh và chứng từ tối đa 20 MB</small>
      {selectionError?.group === 'receipts' && <p className="booking-alert is-error" role="alert">{selectionError.message}</p>}
      {fileList(receipts, 'receipts')}
    </div>
    {busy && <div role="status">
      <p>{progress === 100 ? 'Đang lưu kết quả…' : progress == null ? 'Đang gửi kết quả…' : `Đang tải tệp lên · ${progress}%`}</p>
      <progress aria-label="Tiến trình gửi kết quả" max={100} value={progress ?? undefined} />
    </div>}
    <button className="button-primary" disabled={busy}>Gửi kết quả để nghiệm thu</button>
  </form>;
}
