import { BadRequestException, StreamableFile } from '@nestjs/common';
import { rasterImageMime } from '../../raster-image.js';
import { maintenanceUploadLimits, validateMaintenancePhotos, type MaintenanceUpload } from './maintenance-photo.js';

export const repairPhotoCount = 3;
export const repairReceiptCount = 5;
export const repairUploadLimits = { ...maintenanceUploadLimits, files: repairPhotoCount + repairReceiptCount };

type RepairUpload = MaintenanceUpload & { originalname: string };
export type RepairUploads = { photos?: RepairUpload[]; receipts?: RepairUpload[] };

function fileName(name: string, mimeType: string) {
  let decoded = name;
  if (/^[\x00-\xff]*$/.test(name)) {
    try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(name, 'latin1')); }
    catch { /* Keep the original name if it was already decoded. */ }
  }
  const base = decoded.split(/[\\/]/).pop() ?? '';
  const extension = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
  const stem = base.replace(/\.[^.]*$/, '').replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  return (Array.from(stem).slice(0, 120).join('') || 'tep-bao-tri') + '.' + extension;
}

function validateReceipt({ buffer, mimetype, originalname }: RepairUpload, position: number) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > repairUploadLimits.fileSize) {
    throw new BadRequestException('Mỗi chứng từ phải có dung lượng tối đa 5 MB.');
  }
  const imageMime = rasterImageMime(buffer);
  const isPdf = /^%PDF-[12]\.\d(?:\r|\n)/.test(buffer.toString('latin1', 0, 10))
    && /%%EOF\s*$/.test(buffer.subarray(-1024).toString('latin1'));
  const detected = isPdf ? 'application/pdf' : imageMime;
  if (!detected || !['image/jpeg', 'image/png', 'application/pdf'].includes(detected)
    || (mimetype !== detected && mimetype !== 'application/octet-stream')) {
    throw new BadRequestException('Chỉ chấp nhận chứng từ JPG, PNG hoặc PDF hợp lệ.');
  }
  return { kind: 'RECEIPT', bytes: new Uint8Array(buffer), mimeType: detected, fileName: fileName(originalname, detected), position };
}

export function validateRepairAttachments({ photos = [], receipts = [] }: RepairUploads) {
  if (photos.length > repairPhotoCount || receipts.length > repairReceiptCount) {
    throw new BadRequestException('Chỉ được gửi tối đa 3 ảnh sửa chữa và 5 chứng từ.');
  }
  if ([...photos, ...receipts].reduce((size, file) => size + file.buffer.length, 0) > 20 * 1024 * 1024) {
    throw new BadRequestException('Tổng dung lượng ảnh và chứng từ không quá 20 MB.');
  }
  return [
    ...validateMaintenancePhotos(photos).map(({ bytes, mimeType, position }) => ({
      kind: 'PHOTO', bytes, mimeType, fileName: fileName(photos[position].originalname, mimeType), position,
    })),
    ...receipts.map(validateReceipt),
  ];
}

export function streamRepairAttachment(file: { bytes: Uint8Array; mimeType: string; fileName: string }, download?: string) {
  const name = encodeURIComponent(file.fileName).replace(/[!'()*]/g, character => '%' + character.charCodeAt(0).toString(16));
  return new StreamableFile(file.bytes, {
    type: file.mimeType, disposition: (download === '1' ? 'attachment' : 'inline') + "; filename*=UTF-8''" + name,
  });
}
