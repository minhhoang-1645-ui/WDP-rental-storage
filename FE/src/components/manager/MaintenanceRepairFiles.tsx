import { useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { MaintenancePhoto } from './MaintenancePhotoGallery';
import { first, rows, type Row } from './portal-data';

export function MaintenanceRepairFiles({ record, submission, kind }: {
  record: string; submission: Row; kind: 'PHOTO' | 'RECEIPT';
}) {
  const files = rows(submission.repairAttachments).filter(file => file.kind === kind);
  if (!files.length) return null;
  const base = `/manager/maintenance/${encodeURIComponent(record)}/submissions/${encodeURIComponent(first(submission, 'id'))}/attachments/`;
  return <ul className={kind === 'PHOTO' ? 'incident-photos' : 'record-note'}>
    {files.map((file, index) => {
      const id = first(file, 'id');
      const path = base + encodeURIComponent(id);
      return <li key={id}>{kind === 'PHOTO'
        ? <MaintenancePhoto path={path} index={index + 1} label="Ảnh kết quả sửa chữa" />
        : <RepairReceipt path={path} file={file} />}</li>;
    })}
  </ul>;
}

function RepairReceipt({ path, file }: { path: string; file: Row }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = first(file, 'fileName');
  async function open(download: boolean) {
    if (busy) return;
    const viewer = download ? null : window.open('', '_blank');
    if (viewer) { viewer.opener = null; viewer.document.body.textContent = 'Đang tải chứng từ…'; }
    setBusy(true);
    setError('');
    try {
      const mimeType = first(file, 'mimeType');
      const blob = await apiRequest<Blob>(path + (download ? '?download=1' : ''), {
        responseType: 'blob', headers: { Accept: mimeType },
      });
      if (blob.type !== mimeType) throw new Error('Máy chủ không trả về đúng định dạng chứng từ.');
      const url = URL.createObjectURL(blob);
      if (viewer) viewer.location.replace(url);
      else {
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
    } catch (failure) {
      viewer?.close();
      setError(failure instanceof Error ? failure.message : 'Không tải được chứng từ.');
    } finally { setBusy(false); }
  }
  return <>
    <p className="record-text">{name}</p>
    <div className="evidence-photo-controls">
      <button type="button" className="button-secondary" aria-label={'Mở ' + name} disabled={busy} onClick={() => void open(false)}><ExternalLink size={15} aria-hidden="true" /> Mở</button>
      <button type="button" className="button-secondary" aria-label={'Tải xuống ' + name} disabled={busy} onClick={() => void open(true)}><Download size={15} aria-hidden="true" /> Tải xuống</button>
    </div>
    {busy && <span role="status">Đang tải chứng từ…</span>}
    {error && <p className="portal-error" role="alert">{error}</p>}
  </>;
}
