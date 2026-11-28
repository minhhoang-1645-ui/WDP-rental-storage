import { useState } from 'react';
import { apiRequest } from '../../services/api';

export function useDocumentFile(path: string, name: string) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function open(download: boolean) {
    if (busy) return;
    const viewer = download ? null : window.open('', '_blank');
    if (viewer) { viewer.opener = null; viewer.document.title = 'Đang tải tài liệu…'; viewer.document.body.textContent = 'Đang tải tài liệu…'; }
    setBusy(true); setError('');
    try {
      const blob = await apiRequest<Blob>(path, { responseType: 'blob' });
      if (!blob.type.includes('pdf')) throw new Error('Chưa tải được tài liệu PDF. Vui lòng thử lại.');
      const url = URL.createObjectURL(blob);
      if (viewer) viewer.location.replace(url);
      else { const link = document.createElement('a'); link.href = url; link.download = `${name.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`; link.click(); }
      window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
    } catch (error) { viewer?.close(); setError(error instanceof Error ? error.message : 'Không tải được tài liệu.'); }
    finally { setBusy(false); }
  }
  return { busy, error, open };
}
