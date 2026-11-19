export const PAGE_SIZE_OPTIONS = [5, 10] as const;
export const DEFAULT_PAGE_SIZE = 10;

export function internalPageSize(params: URLSearchParams, key = 'limit') {
  const value = Number(params.get(key));
  return PAGE_SIZE_OPTIONS.find(size => size === value) ?? DEFAULT_PAGE_SIZE;
}
