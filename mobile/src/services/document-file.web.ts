import { apiRequest } from './api';
export async function openDocument(path: string, name: string) {
  const viewer = window.open('', '_blank');
  if (viewer) { viewer.opener = null; viewer.document.body.textContent = 'Đang tải PDF bảo mật…'; }
  try {
    const bytes = await apiRequest<Uint8Array>(path, { responseType: 'bytes' });
    if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('Máy chủ chưa trả về PDF hợp lệ.');
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
    if (viewer) viewer.location.replace(url);
    else { const link = document.createElement('a'); link.href = url; link.download = `${name.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`; link.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 300_000);
  } catch (error) { viewer?.close(); throw error; }
}
