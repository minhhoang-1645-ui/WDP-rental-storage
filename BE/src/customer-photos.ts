import { BadRequestException } from '@nestjs/common';

export function customerPhotos(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3) throw new BadRequestException('Chỉ được gửi tối đa 3 ảnh.');
  return value.map(photo => {
    if (typeof photo !== 'string' || photo.length > 540023 || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(photo)) {
      throw new BadRequestException('Ảnh JPEG không hợp lệ hoặc quá lớn.');
    }
    const encoded = photo.slice('data:image/jpeg;base64,'.length);
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
      throw new BadRequestException('Ảnh JPEG không hợp lệ.');
    }
    return photo;
  });
}
