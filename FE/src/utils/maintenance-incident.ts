export const incidentAreas: Record<string, string> = {
  CORRIDOR: 'Hành lang', ENTRANCE: 'Cổng ra vào', SECURITY: 'Camera / an ninh',
  UTILITIES: 'Khu vực điện / nước', OTHER: 'Khu vực khác',
};

export const incidentCategories: Record<string, string> = {
  LOCK_OR_ACCESS: 'Khóa / cửa ô kho', ACCESS_CREDENTIAL: 'Thẻ / mã truy cập',
  FACILITY_EQUIPMENT: 'Hư hỏng cơ sở vật chất', UTILITIES: 'Điện / nước',
  SECURITY: 'An ninh / an toàn', OTHER: 'Khác',
};

export const incidentArea = (value: unknown) => typeof value === 'string' ? incidentAreas[value] ?? '' : '';

export const rentalImpacts = {
  NO_IMPACT: 'Không ảnh hưởng',
  AFFECTED: 'Có ảnh hưởng',
  UNKNOWN: 'Chưa xác định ô có an toàn để cho thuê',
};
