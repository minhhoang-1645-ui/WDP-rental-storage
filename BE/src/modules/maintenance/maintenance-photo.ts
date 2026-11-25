import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

const maxPhotoBytes = 5 * 1024 * 1024;
const maxPhotos = 5;
export const maintenanceUploadLimits = { fileSize: maxPhotoBytes, files: maxPhotos, fields: 10, fieldSize: 32 * 1024 };

export interface MaintenanceUpload {
  buffer: Buffer;
  mimetype: string;
}

function mimeOf(bytes: Buffer) {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) return 'image/jpeg';
  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND') return 'image/png';
  if (bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.readUInt32LE(4) + 8 === bytes.length
    && bytes.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))) return 'image/webp';
  return null;
}

export function validateMaintenancePhotos(files: MaintenanceUpload[]) {
  if (files.length > maxPhotos) throw new BadRequestException('Chỉ được chọn tối đa 5 ảnh.');
  return files.map(({ buffer, mimetype }, position) => {
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > maxPhotoBytes) {
      throw new BadRequestException('Mỗi ảnh phải có dung lượng tối đa 5 MB.');
    }
    const mimeType = mimeOf(buffer);
    if (!mimeType || mimeType !== mimetype) throw new BadRequestException('Chỉ chấp nhận ảnh JPG, PNG hoặc WebP hợp lệ.');
    return { bytes: new Uint8Array(buffer), mimeType, position, digest: createHash('sha256').update(buffer).digest('hex') };
  });
}
