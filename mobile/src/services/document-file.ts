import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiRequest } from './api';

export async function saveCsv(path: string, name: string) {
  if (!await Sharing.isAvailableAsync()) throw new Error('Thiết bị chưa hỗ trợ lưu/chia sẻ tệp. Hãy dùng bản web để tải CSV.');
  const bytes = await apiRequest<Uint8Array>(path, { responseType: 'bytes' });
  const file = new File(Paths.cache, `${Date.now()}-${name.replace(/[^A-Za-z0-9._-]/g, '_')}.csv`);
  file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Lưu hoặc chia sẻ báo cáo' });
  setTimeout(() => { try { if (file.exists) file.delete(); } catch { /* OS cache cleanup may have run. */ } }, 600_000);
}

export async function openDocument(path: string, name: string) {
  if (!await Sharing.isAvailableAsync()) throw new Error('Thiết bị chưa có ứng dụng mở / chia sẻ PDF. Vui lòng dùng bản web để tải tài liệu.');
  const bytes = await apiRequest<Uint8Array>(path, { responseType: 'bytes' });
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('Máy chủ chưa trả về PDF hợp lệ.');
  const file = new File(Paths.cache, `${Date.now()}-${name.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`);
  file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Mở, lưu hoặc in tài liệu PDF' });
  // Private app cache, never a public URL containing a bearer token.
  setTimeout(() => { try { if (file.exists) file.delete(); } catch { /* OS may already have cleared cache. */ } }, 600_000);
}
