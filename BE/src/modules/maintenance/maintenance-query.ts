import { BadRequestException } from '@nestjs/common';
import type { MaintenanceListQuery } from './maintenance.service.js';

const statuses = ['OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'COMPLETED'] as const;
const priorities = ['LOW', 'MEDIUM', 'HIGH'] as const;
const categories = ['UNIT_DAMAGE', 'CLEANING', 'LOCK_OR_ACCESS', 'FACILITY_EQUIPMENT', 'OTHER'] as const;

export function parseMaintenanceQuery(input: Record<string, unknown>): MaintenanceListQuery {
  const page = integer(input.page, 1, 100000, 'page');
  const limit = integer(input.limit, 20, 100, 'limit');
  const status = optional(input.status, 'status');
  const priority = optional(input.priority, 'priority');
  const category = optional(input.category, 'category');
  const search = optional(input.search, 'search');
  if (status && !statuses.includes(status as never)) throw new BadRequestException('Maintenance status không hợp lệ.');
  if (priority && !priorities.includes(priority as never)) throw new BadRequestException('Maintenance priority không hợp lệ.');
  if (category && !categories.includes(category as never)) throw new BadRequestException('Maintenance category không hợp lệ.');
  const assignedToMe = input.assignedToMe === 'true' || input.assignedToMe === true;
  if (input.assignedToMe !== undefined && !['true', 'false', true, false].includes(input.assignedToMe as never)) throw new BadRequestException('assignedToMe phải là true hoặc false.');
  return {
    page, limit, assignedToMe,
    ...(status ? { status: status as MaintenanceListQuery['status'] } : {}),
    ...(priority ? { priority: priority as MaintenanceListQuery['priority'] } : {}),
    ...(category ? { category: category as MaintenanceListQuery['category'] } : {}),
    ...(search ? { search } : {}),
  };
}

function integer(value: unknown, fallback: number, maximum: number, label: string) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new BadRequestException(`${label} không hợp lệ.`);
  return parsed;
}

function optional(value: unknown, label: string) {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length > 120) throw new BadRequestException(`${label} không hợp lệ.`);
  return value.trim();
}
