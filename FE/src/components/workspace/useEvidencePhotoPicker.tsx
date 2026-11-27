import { useRef, useState } from 'react';
import { markFormDirty } from '../../services/live-events';

const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];

function readHandoverPhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Không đọc được ảnh bàn giao.'));
    reader.onerror = () => reject(new Error('Không đọc được ảnh bàn giao.'));
    reader.readAsDataURL(file);
  });
}

export function useEvidencePhotoPicker(label: string, disabled: boolean, initialPhotos: string[] = []) {
  const [readingPhotos, setReadingPhotos] = useState(false);
  const [handoverPhotos, setHandoverPhotos] = useState(() => initialPhotos.map((src, index) => ({
    id: index, name: `Ảnh đã lưu ${index + 1}`, src,
  })));
  const [photoError, setPhotoError] = useState('');
  const nextPhotoId = useRef(initialPhotos.length);
  const photoReadLock = useRef(false);

  async function addHandoverPhotos(files: File[]) {
    if (!files.length || photoReadLock.current || disabled) return;
    if (handoverPhotos.length + files.length > 3) {
      setPhotoError('Chỉ được đính kèm tối đa 3 ảnh. Bỏ ảnh đã chọn để thêm ảnh khác.');
      return;
    }
    if (files.some(file => !photoTypes.includes(file.type) || file.size === 0 || file.size > 400 * 1024)) {
      setPhotoError('Chọn ảnh JPG, PNG hoặc WebP tối đa 400 KB mỗi ảnh.');
      return;
    }
    photoReadLock.current = true;
    setReadingPhotos(true);
    setPhotoError('');
    try {
      const additions = await Promise.all(files.map(async file => ({
        id: nextPhotoId.current++, name: file.name, src: await readHandoverPhoto(file),
      })));
      setHandoverPhotos(previous => [...previous, ...additions]);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Không đọc được ảnh bàn giao.');
    } finally {
      photoReadLock.current = false;
      setReadingPhotos(false);
    }
  }
  const busy = disabled || readingPhotos;
  const photoPicker = <div className="staff-handover-photo-picker">
                <label className="field-label">{label}
                  <input type="file" accept={photoTypes.join(',')} multiple disabled={busy || handoverPhotos.length === 3}
                    onChange={event => {
                      const files = Array.from(event.target.files ?? []);
                      event.target.value = '';
                      void addHandoverPhotos(files);
                    }} />
                  <small>JPG, PNG hoặc WebP, tối đa 400 KB mỗi ảnh. Có thể chọn từng ảnh hoặc chọn nhiều ảnh cùng lúc.</small>
                </label>
                <p role="status">{readingPhotos ? 'Đang đọc ảnh…' : `Đã chọn ${handoverPhotos.length}/3 ảnh`}</p>
                {photoError && <p className="booking-alert is-error" role="alert">{photoError}</p>}
                {handoverPhotos.length > 0 && <ul className="staff-handover-photos staff-handover-photo-preview" aria-label={'Ảnh đã chọn'}>
                  {handoverPhotos.map(photo => <li key={photo.id}>
                    <img src={photo.src} alt={photo.name} />
                    <span>{photo.name}</span>
                    <button type="button" className="button-secondary" disabled={busy} aria-label={'Bỏ ảnh ' + photo.name} onClick={event => {
                      const form = event.currentTarget.form;
                      if (form) markFormDirty(form);
                      setHandoverPhotos(previous => previous.filter(item => item.id !== photo.id));
                      setPhotoError('');
                    }}>Bỏ ảnh</button>
                  </li>)}
                </ul>}
              </div>;
  return { handoverPhotos, readingPhotos, photoPicker, photoReadLock };
}
