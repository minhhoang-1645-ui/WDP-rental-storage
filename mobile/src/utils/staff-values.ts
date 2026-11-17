/** Optional absent data is not a false boolean. Keep real false and zero values. */
export function hasStaffValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '' && value.trim() !== '—';
  if (Array.isArray(value)) return value.some(hasStaffValue);
  if (typeof value === 'object') return Object.values(value).some(hasStaffValue);
  return true;
}
