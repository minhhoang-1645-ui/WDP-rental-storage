import { BadRequestException } from '@nestjs/common';
import { rasterImageMime } from './raster-image.js';

const maxPhotoBytes = 400 * 1024;

export function evidencePhotos(input: unknown): string[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 3) throw new BadRequestException('Chỉ được gửi tối đa 3 tệp ảnh.');
  return input.map(value => {
    const match = typeof value === 'string' && value.length <= 4 * Math.ceil(maxPhotoBytes / 3) + 32
      ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value) : null;
    if (!match) throw new BadRequestException('Chỉ chấp nhận ảnh JPG, PNG hoặc WebP tối đa 400 KB mỗi ảnh.');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > maxPhotoBytes || bytes.toString('base64') !== match[2] || rasterImageMime(bytes) !== match[1])
      throw new BadRequestException('Tệp ảnh bàn giao không hợp lệ.');
    return match[0];
  });
}
