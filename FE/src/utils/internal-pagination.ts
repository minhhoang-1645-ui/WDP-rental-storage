export const internalPageSizes = [10, 20, 50] as const;

export function internalPageSize(params: URLSearchParams) {
  const value = Number(params.get('limit'));
  return value === 5 ? 5 : internalPageSizes.find(size => size === value) ?? 10;
}
export const staffTaskPageSizes = internalPageSizes;

export function staffTaskPageSize(params: URLSearchParams) {
  const size = Number(params.get('limit'));
  return staffTaskPageSizes.find(value => value === size) ?? 20;
}
