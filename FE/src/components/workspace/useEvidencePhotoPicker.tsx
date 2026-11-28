import { useRef, useState, type ChangeEvent } from 'react';
import { markFormDirty } from '../../services/live-events';
import { EvidencePhotoField } from './EvidencePhotoField';

const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];

function readHandoverPhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Không đọc được ảnh.'));
    reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
    reader.readAsDataURL(file);
  });
}

async function resizeCameraPhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Không xử lý được ảnh chụp.');
    for (const size of [1600, 1200, 900, 640]) {
      const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .75));
      if (blob && blob.size <= 400 * 1024) return new File([blob], 'anh-kiem-tra.jpg', { type: 'image/jpeg' });
    }
    throw new Error('Không thể giảm ảnh chụp xuống 400 KB. Hãy chọn ảnh nhỏ hơn.');
  } finally {
    bitmap.close();
  }
}

export function useEvidencePhotoPicker(label: string, disabled: boolean, initialPhotos: string[] = []) {
  const [readingPhotos, setReadingPhotos] = useState(false);
  const [handoverPhotos, setHandoverPhotos] = useState(() => initialPhotos.map((src, index) => ({
    id: index, name: `Ảnh đã lưu ${index + 1}`, src,
  })));
  const [photoError, setPhotoError] = useState('');
  const nextPhotoId = useRef(initialPhotos.length);
  const photoReadLock = useRef(false);

  async function addHandoverPhotos(files: File[], fromCamera: boolean) {
    if (!files.length || photoReadLock.current || disabled) return;
    if (handoverPhotos.length + files.length > 3) {
      setPhotoError('Chỉ được đính kèm tối đa 3 ảnh. Bỏ ảnh đã chọn để thêm ảnh khác.');
      return;
    }
    if (files.some(file => !photoTypes.includes(file.type) || file.size === 0 || file.size > (fromCamera ? 15 * 1024 * 1024 : 400 * 1024))) {
      setPhotoError('Chọn ảnh JPG, PNG hoặc WebP tối đa 400 KB mỗi ảnh.');
      return;
    }
    photoReadLock.current = true;
    setReadingPhotos(true);
    setPhotoError('');
    try {
      const additions = await Promise.all(files.map(async file => ({
        id: nextPhotoId.current++, name: file.name,
        src: await readHandoverPhoto(fromCamera && file.size > 400 * 1024 ? await resizeCameraPhoto(file) : file),
      })));
      setHandoverPhotos(previous => [...previous, ...additions]);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Không đọc được ảnh.');
    } finally {
      photoReadLock.current = false;
      setReadingPhotos(false);
    }
  }
  const busy = disabled || readingPhotos;
  function selectPhotos(event: ChangeEvent<HTMLInputElement>, fromCamera = false) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void addHandoverPhotos(files, fromCamera);
  }
  const photoPicker = <EvidencePhotoField label={label} accept={photoTypes.join(',')}
    count={handoverPhotos.length} limit={3} help="JPG, PNG hoặc WebP · Tối đa 400 KB mỗi ảnh"
    disabled={disabled} reading={readingPhotos} error={photoError} onSelect={selectPhotos}>
    {handoverPhotos.length > 0 && <ul className="evidence-photo-previews" aria-label="Ảnh đã chọn">
      {handoverPhotos.map(photo => <li key={photo.id}>
        <img src={photo.src} alt={photo.name} />
        <span title={photo.name}>{photo.name}</span>
        <button type="button" className="button-secondary" disabled={busy} aria-label={'Bỏ ảnh ' + photo.name} onClick={event => {
          const form = event.currentTarget.form;
          if (form) markFormDirty(form);
          setHandoverPhotos(previous => previous.filter(item => item.id !== photo.id));
          setPhotoError('');
        }}>Bỏ ảnh</button>
      </li>)}
    </ul>}
  </EvidencePhotoField>;
  return { handoverPhotos, readingPhotos, photoPicker, photoReadLock };
}
