import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiRequest } from './api';

export async function saveCsv(path: string, name: string) {
  if (!await Sharing.isAvailableAsync()) throw new Error('Thiết bị chưa hỗ trợ lưu/chia sẻ tệp. Hãy dùng bản web để tải CSV.');
  const bytes = await apiRequest<Uint8Array>(path, { responseType: 'bytes' });
  const file = new File(Paths.cache, `${Date.now()}-${name.replace(/[^A-Za-z0-9._-]/g, '_')}.csv`);
  await file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Lưu hoặc chia sẻ báo cáo' });
  setTimeout(() => { try { if (file.exists) file.delete(); } catch { /* OS cache cleanup may have run. */ } }, 600_000);
}

export async function downloadPdf(path: string, name: string) {
  const bytes = await apiRequest<Uint8Array>(path, { responseType: 'bytes' });
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('Máy chủ chưa trả về PDF hợp lệ.');
  const filename = name.replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9._-]/g, '_');
  const file = new File(Paths.cache, `${Date.now()}-${filename}.pdf`);
  try {
    file.create();
    await file.write(bytes);
    if (file.size !== bytes.byteLength) throw new Error('Không lưu được toàn bộ tệp PDF.');
    return file;
  } catch {
    discardPdf(file);
    throw new Error('Chưa lưu được tài liệu PDF. Vui lòng thử lại.');
  }
}

export function discardPdf(file: File) {
  try { if (file.exists) file.delete(); } catch { /* The OS may have cleared the cache. */ }
}

export async function openDocument(path: string, name: string) {
  const file = await downloadPdf(path, name);
  try {
    try {
      const preview = (file as File & { preview?: (options: { mimeType: string }) => Promise<void> }).preview;
      if (typeof preview !== 'function') throw new Error('Native preview is unavailable in this installed runtime.');
      await preview.call(file, { mimeType: 'application/pdf' });
    } catch {
      if (!await Sharing.isAvailableAsync()) throw new Error('Thiết bị chưa hỗ trợ mở PDF.');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Mở, lưu hoặc in tài liệu PDF' });
    }
    // The native viewer may still need the file after opening.
    setTimeout(() => discardPdf(file), 600_000);
  } catch {
    discardPdf(file);
    throw new Error('Chưa mở được tài liệu PDF. Hãy thử lại hoặc mở hợp đồng trên web.');
  }
}
