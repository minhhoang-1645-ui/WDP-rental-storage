import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { rasterImageMime } from '../../raster-image.js';

const maxPhotoBytes = 5 * 1024 * 1024;
const maxPhotos = 5;
export const maintenanceUploadLimits = { fileSize: maxPhotoBytes, files: maxPhotos, fields: 10, fieldSize: 32 * 1024 };

export interface MaintenanceUpload {
  buffer: Buffer;
  mimetype: string;
}



export function validateMaintenancePhotos(files: MaintenanceUpload[]) {
  if (files.length > maxPhotos) throw new BadRequestException('Chỉ được chọn tối đa 5 ảnh.');
  return files.map(({ buffer, mimetype }, position) => {
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > maxPhotoBytes) {
      throw new BadRequestException('Mỗi ảnh phải có dung lượng tối đa 5 MB.');
    }
    const mimeType = rasterImageMime(buffer);
    if (!mimeType || mimeType !== mimetype) throw new BadRequestException('Chỉ chấp nhận ảnh JPG, PNG hoặc WebP hợp lệ.');
    return { bytes: new Uint8Array(buffer), mimeType, position, digest: createHash('sha256').update(buffer).digest('hex') };
  });
}
