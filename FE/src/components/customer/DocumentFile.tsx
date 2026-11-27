import { FileText, Download, Printer } from 'lucide-react';
import { useDocumentFile } from './useDocumentFile';

export function DocumentFile({ path, name, signed = false, description }: { path: string; name: string; signed?: boolean; description?: string }) {
  const { busy, error, open } = useDocumentFile(path, name);
  return <section className="document-file" aria-label={`File ${name}`}>
    <FileText size={30} aria-hidden="true" />
    <div><strong>{name}.pdf</strong><small>{description || (signed ? 'Bản đã ký · PDF' : 'Tài liệu PDF')}</small></div>
    <div className="document-file-actions"><button type="button" className="button-secondary" disabled={busy} onClick={() => void open(false)}><Printer size={16} />{busy ? 'Đang tải…' : 'Xem / in PDF'}</button><button type="button" className="button-secondary" disabled={busy} onClick={() => void open(true)}><Download size={16} />Tải PDF</button></div>
    {error && <p role="alert" className="portal-error">{error}</p>}
  </section>;
}
