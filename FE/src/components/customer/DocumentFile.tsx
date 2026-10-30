import { useState } from 'react';
import { FileText, Download, Printer } from 'lucide-react';
import { apiRequest } from '../../services/api';

export function DocumentFile({ path, name, signed = false }: { path: string; name: string; signed?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function open(download: boolean) {
    if (busy) return;
    const viewer = download ? null : window.open('', '_blank');
    if (viewer) { viewer.opener = null; viewer.document.title = 'Đang tải tài liệu…'; viewer.document.body.textContent = 'Đang tải PDF bảo mật…'; }
    setBusy(true); setError('');
    try {
      const blob = await apiRequest<Blob>(path, { responseType: 'blob' });
      if (!blob.type.includes('pdf')) throw new Error('Máy chủ chưa trả về file PDF hợp lệ.');
      const url = URL.createObjectURL(blob);
      if (viewer) viewer.location.replace(url);
      else { const link = document.createElement('a'); link.href = url; link.download = `${name.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`; link.click(); }
      window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
    } catch (error) { viewer?.close(); setError(error instanceof Error ? error.message : 'Không tải được tài liệu.'); }
    finally { setBusy(false); }
  }
  return <section className="document-file" aria-label={`File ${name}`}>
    <FileText size={30} aria-hidden="true" />
    <div><strong>{name}.pdf</strong><small>{signed ? 'Bản có chữ ký đã lưu' : 'Xem toàn bộ nội dung trước khi ký'} · PDF</small><small>Bản có nhãn “Dự thảo” chưa được phát hành chính thức. Mở file và dùng nút in trong trình đọc PDF.</small></div>
    <div className="document-file-actions"><button type="button" className="button-secondary" disabled={busy} onClick={() => void open(false)}><Printer size={16} />{busy ? 'Đang tải…' : 'Xem / in PDF'}</button><button type="button" className="button-secondary" disabled={busy} onClick={() => void open(true)}><Download size={16} />Tải PDF</button></div>
    {error && <p role="alert" className="portal-error">{error}</p>}
  </section>;
}
