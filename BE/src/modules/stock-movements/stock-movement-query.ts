import { BadRequestException } from '@nestjs/common';

export function parseStockMovementQuery(input: Record<string, unknown>) {
  const page = integer(input.page, 1, 100000, 'page');
  const limit = integer(input.limit, 20, 100, 'limit');
  const status = optional(input.status, 'status');
  const type = optional(input.type, 'type');
  const search = optional(input.search, 'search');
  if (status && !['REQUESTED', 'ASSIGNED', 'COMPLETED', 'CANCELLED'].includes(status)) throw new BadRequestException('status không hợp lệ.');
  if (type && !['IN', 'OUT'].includes(type)) throw new BadRequestException('type không hợp lệ.');
  return { page, limit, ...(status ? { status: status as 'REQUESTED' | 'ASSIGNED' | 'COMPLETED' | 'CANCELLED' } : {}), ...(type ? { type: type as 'IN' | 'OUT' } : {}), ...(search ? { search } : {}) };
}

function integer(value: unknown, fallback: number, maximum: number, label: string) { if (value === undefined) return fallback; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new BadRequestException(`${label} không hợp lệ.`); return parsed; }
function optional(value: unknown, label: string) { if (value === undefined || value === '') return undefined; if (typeof value !== 'string' || value.trim().length > 120) throw new BadRequestException(`${label} không hợp lệ.`); return value.trim(); }
