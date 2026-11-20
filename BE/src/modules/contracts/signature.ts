import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

export function signaturePngBytes(value: unknown): Buffer | null {
  if (typeof value !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > 90_000) return null;
  const bytes = Buffer.from(value.slice('data:image/png;base64,'.length), 'base64');
  if (bytes.length < 100 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
  try {
    let offset = 8, width = 0, height = 0, depth = 0, channels = 0, ended = false;
    const data: Buffer[] = [];
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset), end = offset + 12 + size;
      if (end > bytes.length || size > 70_000) return null;
      const type = bytes.toString('ascii', offset + 4, offset + 8), payload = bytes.subarray(offset + 8, offset + 8 + size);
      let crc = 0xffffffff;
      for (const byte of bytes.subarray(offset + 4, end - 4)) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
      if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(end - 4)) return null;
      if (offset === 8 && type !== 'IHDR') return null;
      if (type === 'IHDR') { if (size !== 13 || width) return null; width = payload.readUInt32BE(0); height = payload.readUInt32BE(4); depth = payload[8]; channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[payload[9]]; if (!width || !height || width > 2400 || height > 1200 || width * height > 2_880_000 || !channels || ![1, 2, 4, 8].includes(depth) || [2, 4, 6].includes(payload[9]) && depth !== 8 || payload[10] || payload[11] || payload[12]) return null; }
      if (type === 'IDAT') data.push(payload);
      if (type === 'IEND') { if (size || end !== bytes.length) return null; ended = true; break; }
      offset = end;
    }
    if (!ended || !data.length) return null;
    const row = Math.ceil(width * channels * depth / 8) + 1, expected = row * height;
    const decoded = inflateSync(Buffer.concat(data), { maxOutputLength: expected });
    if (decoded.length !== expected) return null;
    for (let y = 0; y < height; y++) if (decoded[y * row] > 4) return null;
    return bytes;
  } catch { return null; }
}

export function validateSignature(input: Record<string, unknown>) {
  if (input.agreed !== true) throw new BadRequestException('Vui lòng xác nhận đã đọc và đồng ý nội dung.');
  const value = typeof input.signatureImage === 'string' ? input.signatureImage : '';
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > 90_000) throw new BadRequestException('Chữ ký phải là ảnh PNG hợp lệ, tối đa 90.000 ký tự.');
  if (!signaturePngBytes(value)) throw new BadRequestException('Ảnh chữ ký không hợp lệ hoặc bị hỏng. Vui lòng ký lại.');
  return value;
}

export function snapshotHash(snapshot: unknown) {
  // PostgreSQL JSONB reorders object keys; document identity must survive storage.
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex');
}
