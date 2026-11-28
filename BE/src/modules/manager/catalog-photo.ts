import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

export const catalogPhotoLimits = { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, fieldSize: 16 * 1024 };

export async function prepareCatalogPhoto(buffer: Buffer) {
  if (!buffer.length || buffer.length > catalogPhotoLimits.fileSize) {
    throw new BadRequestException('Ảnh phải có dung lượng tối đa 5 MB.');
  }
  let bytes: Buffer;
  try {
    const image = sharp(buffer, { failOn: 'warning', limitInputPixels: 30_000_000 });
    const { format } = await image.metadata();
    if (!format || !['jpeg', 'png', 'webp'].includes(format)) throw new Error('unsupported');
    bytes = await image.rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
  } catch {
    throw new BadRequestException('Chỉ chấp nhận ảnh JPG, PNG hoặc WebP hợp lệ, tối đa 30 megapixel.');
  }

  const origin = process.env.CATALOG_STORAGE_URL?.trim();
  const key = process.env.CATALOG_STORAGE_SERVICE_KEY?.trim();
  const bucket = process.env.CATALOG_STORAGE_BUCKET?.trim();
  if (!origin || !/^https:\/\/[a-z0-9.-]+$/i.test(origin) || !key || !bucket || !/^[\w-]+$/.test(bucket)) {
    throw new ServiceUnavailableException('Kho lưu trữ ảnh loại kho chưa được cấu hình.');
  }
  const objectPath = 'catalog/' + randomUUID() + '.webp';
  const endpoint = origin + '/storage/v1/object/';
  const url = endpoint + 'public/' + bucket + '/' + objectPath;
  const headers = {
    apikey: key,
    ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }),
  };
  return {
    url,
    async upload() {
      try {
        const response = await fetch(endpoint + bucket + '/' + objectPath, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'image/webp', 'Cache-Control': 'max-age=31536000' },
          body: new Uint8Array(bytes),
          signal: AbortSignal.timeout(8000), redirect: 'error',
        });
        if (response.ok) return;
      } catch { /* Return a stable error without exposing provider details. */ }
      throw new ServiceUnavailableException('Không thể tải ảnh lên. Vui lòng thử lại.');
    },
    async discard() {
      const response = await fetch(endpoint + bucket, {
        method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [objectPath] }), signal: AbortSignal.timeout(5000), redirect: 'error',
      });
      if (!response.ok && response.status !== 404) throw new Error('Catalog photo cleanup failed');
    },
  };
}
