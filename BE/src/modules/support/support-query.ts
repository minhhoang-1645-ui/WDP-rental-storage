import { BadRequestException } from '@nestjs/common';
import type { SupportListQuery } from './support.service.js';
const statuses = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'];
const priorities = ['LOW', 'MEDIUM', 'HIGH'];
const categories = ['UNIT_ISSUE', 'LOCK_OR_KEY_ISSUE', 'ACCESS_CODE_ISSUE', 'FACILITY_EQUIPMENT_FAILURE', 'PAYMENT_SUPPORT', 'STORED_ITEM_CONCERN', 'OTHER'];
export function parseSupportQuery(input: Record<string, unknown>): SupportListQuery {
  const page = integer(input.page, 1, 100000, 'page'); const limit = integer(input.limit, 20, 100, 'limit');
  const status = optional(input.status, 'status'); const priority = optional(input.priority, 'priority'); const category = optional(input.category, 'category'); const search = optional(input.search, 'search');
  if (status && !statuses.includes(status)) throw new BadRequestException('Support status không hợp lệ.');
  if (priority && !priorities.includes(priority)) throw new BadRequestException('Support priority không hợp lệ.');
  if (category && !categories.includes(category)) throw new BadRequestException('Support category không hợp lệ.');
  const assignedToMe = input.assignedToMe === true || input.assignedToMe === 'true';
  if (input.assignedToMe !== undefined && ![true, false, 'true', 'false'].includes(input.assignedToMe as never)) throw new BadRequestException('assignedToMe phải là true hoặc false.');
  return { page, limit, assignedToMe, ...(status ? { status: status as SupportListQuery['status'] } : {}), ...(priority ? { priority: priority as SupportListQuery['priority'] } : {}), ...(category ? { category: category as SupportListQuery['category'] } : {}), ...(search ? { search } : {}) };
}
function integer(value: unknown, fallback: number, max: number, label: string) { if (value === undefined) return fallback; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new BadRequestException(`${label} không hợp lệ.`); return parsed; }
function optional(value: unknown, label: string) { if (value === undefined || value === '') return undefined; if (typeof value !== 'string' || value.trim().length > 120) throw new BadRequestException(`${label} không hợp lệ.`); return value.trim(); }
