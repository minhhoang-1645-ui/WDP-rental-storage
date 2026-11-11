export function internalPageSize(params: URLSearchParams) {
  const value = Number(params.get('limit'));
  return [5, 10].includes(value) ? value : 10;
}
