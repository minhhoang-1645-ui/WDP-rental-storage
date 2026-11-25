import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

export const sizeGroups = { locker: 'Tủ lưu trữ', small: 'Kho nhỏ', medium: 'Kho vừa', large: 'Kho lớn' };
export type SizeGroup = keyof typeof sizeGroups;
export const groupPriceKey = (sizeId: string) => 'monthlyPriceRange:' + sizeId;
export const groupPriceKeys = Object.keys(sizeGroups).map(groupPriceKey);
export const maxMonthlyPrice = 9_999_999_999;
export const missingPriceRange = 'Nhóm kho này chưa được BOM thiết lập khung giá.';
export type PriceBounds = { min: number; max: number };

export function priceBounds(input: unknown): PriceBounds | null {
  const value = input as PriceBounds | null;
  return value && Number.isSafeInteger(value.min) && Number.isSafeInteger(value.max) &&
    value.min >= 0 && value.min <= value.max && value.max <= maxMonthlyPrice ? { min: value.min, max: value.max } : null;
}

export const priceInRange = (bounds: PriceBounds, price: number) =>
  Number.isSafeInteger(price) && price > 0 && price >= bounds.min && price <= bounds.max;

export function priceVersionStatus(rule: { effectiveFrom: Date; effectiveTo: Date | null }, now: Date) {
  return rule.effectiveFrom > now ? 'SCHEDULED' : rule.effectiveTo && rule.effectiveTo <= now ? 'HISTORICAL' : 'EFFECTIVE';
}

export function currentPriceRules(db: Prisma.TransactionClient, facilityIds: string[], now = new Date()) {
  return db.businessRule.findMany({
    where: { key: { in: groupPriceKeys }, facilityId: { in: facilityIds }, storageTypeId: null,
      effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
    orderBy: { version: 'desc' },
  });
}

export function lockPriceRange(db: Prisma.TransactionClient, facilityId: string, readOnly = false) {
  const lock = readOnly ? 'SELECT 1 FROM pg_advisory_xact_lock_shared(hashtext($1))' : 'SELECT 1 FROM pg_advisory_xact_lock(hashtext($1))';
  return db.$queryRawUnsafe(lock, 'price-range:' + facilityId);
}

export async function resolveMonthlyRange(db: Prisma.TransactionClient, facilityId: string, sizeId: string, now = new Date(), lockVersion = false) {
  if (!Object.hasOwn(sizeGroups, sizeId)) return null;
  const rule = await db.businessRule.findFirst({ where: {
    key: groupPriceKey(sizeId), facilityId, storageTypeId: null,
    effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
  }, orderBy: { version: 'desc' } });
  if (rule && lockVersion) {
    // Reject an older serializable snapshot if publication changed this version while we waited.
    await db.$queryRaw`SELECT id FROM "BusinessRule" WHERE id = ${rule.id} FOR SHARE`;
  }
  return priceBounds(rule?.value);
}

export function assertPriceWithin(bounds: PriceBounds, amount: number) {
  if (!priceInRange(bounds, amount)) throw new BadRequestException(
    'Giá tháng phải nằm trong khung ' + bounds.min.toLocaleString('vi-VN') + ' – ' + bounds.max.toLocaleString('vi-VN') + ' đ do BOM quy định.');
}

export async function assertListedPrice(db: Prisma.TransactionClient, type: {
  facilityId: string; sizeId: string; monthlyRate: unknown; bookingEnabled?: boolean;
}, lockVersion = false) {
  const bounds = await resolveMonthlyRange(db, type.facilityId, type.sizeId, new Date(), lockVersion);
  if (type.bookingEnabled === false || !bounds || !priceInRange(bounds, Number(type.monthlyRate)))
    throw new ConflictException('Loại kho hiện chưa nhận giao dịch mới. Vui lòng chọn loại kho khác.');
}
