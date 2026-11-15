import { useSearchParams } from 'react-router-dom';
import { staffTaskPageSize } from '../../utils/internal-pagination';

export function useManagerTableParams() {
  const [params, setParams] = useSearchParams();
  const page = Math.min(100000, Math.max(1, Math.floor(Number(params.get('page')) || 1)));
  const limit = staffTaskPageSize(params);
  function update(key: string, value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: true });
  }
  return { params, page, limit, update };
}

export function managerTableLink(path: string, params: URLSearchParams, key: string, value: string) {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  return path + (next.size ? '?' + next : '');
}

export function managerReviewReturn(params: URLSearchParams) {
  const from = params.get('from');
  return from && (from === '/manager/reviews' || from.startsWith('/manager/reviews?')) ? from : null;
}

