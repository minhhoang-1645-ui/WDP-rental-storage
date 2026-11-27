import { BadRequestException } from '@nestjs/common';

export function physicalServiceUnit(input: unknown): string | null {
  if (input === null) return null;
  const unit = typeof input === 'string' && !/[\p{C}\p{Zl}\p{Zp}]/u.test(input)
    ? input.normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
  if (unit.length > 40 || !/^\p{L}[\p{L}\p{M}\d -]*$/u.test(unit) ||
    /\b(day|days|month|months|week|weeks|year|years|hour|hours|cycle|period|time|daily|monthly)\b/i.test(unit) ||
    /(?:^|[ -])(?:ngày|tháng|tuần|năm|giờ|phút|quý|kỳ|chu kỳ|lần|khác)(?:[ -]|$)/iu.test(unit)) {
    throw new BadRequestException('Nhập đơn vị vật lý hợp lệ, tối đa 40 ký tự. Ví dụ: cái, bộ hoặc chai.');
  }
  return unit;
}
