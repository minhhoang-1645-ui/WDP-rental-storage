import { label } from '@/operations/model';

export const normalizeSearch = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();

/** Search displayed values and Vietnamese status names without requiring accents. */
export function recordMatches(value: unknown, query: string, extra = '') {
  const terms = normalizeSearch(query).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const parts: string[] = [extra];
  const collect = (entry: unknown, depth: number) => {
    if (typeof entry === 'string' || typeof entry === 'number') { parts.push(String(entry)); if (typeof entry === 'string') parts.push(label(entry)); }
    else if (entry && typeof entry === 'object' && depth < 8) for (const nested of Object.values(entry)) collect(nested, depth + 1);
  };
  collect(value, 0);
  const searchable = normalizeSearch(parts.join(' '));
  return terms.every(term => searchable.includes(term));
}
