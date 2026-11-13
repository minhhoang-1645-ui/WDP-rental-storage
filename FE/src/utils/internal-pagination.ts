export function internalPageSize(params: URLSearchParams) {
  const value = Number(params.get('limit'));
  return [5, 10].includes(value) ? value : 10;
}
export const staffTaskPageSizes = [10, 20, 50] as const;

export function staffTaskPageSize(params: URLSearchParams) {
  const size = Number(params.get('limit'));
  return staffTaskPageSizes.find(value => value === size) ?? 20;
}
