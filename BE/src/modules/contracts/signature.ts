import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

export function validateSignature(input: Record<string, unknown>) {
  if (input.agreed !== true) throw new BadRequestException('Vui lòng xác nhận đã đọc và đồng ý nội dung.');
  const value = typeof input.signatureImage === 'string' ? input.signatureImage : '';
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > 90_000) throw new BadRequestException('Chữ ký phải là ảnh PNG hợp lệ, tối đa 90.000 ký tự.');
  const bytes = Buffer.from(value.slice('data:image/png;base64,'.length), 'base64');
  if (bytes.length < 100 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new BadRequestException('Ảnh chữ ký không hợp lệ.');
  return value;
}

export function snapshotHash(snapshot: unknown) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}
