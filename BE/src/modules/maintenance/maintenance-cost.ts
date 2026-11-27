import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { appendEvidenceLink } from '../facility-access/operational-evidence.js';

export function maintenanceAmount(value: unknown, label: string) {
  if (value == null || value === '') return null;
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^\d{1,18}$/.test(text)) {
    throw new BadRequestException(label + ' phải là số nguyên VND từ 0 đến 18 chữ số.');
  }
  return new Prisma.Decimal(text);
}

export function maintenanceCostEvidence(value: unknown) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 5 || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw new BadRequestException('Đính kèm tối đa 5 liên kết HTTPS đến chứng từ.');
  }
  return [...new Set(value.map(item => String(appendEvidenceLink('', item)).slice('Chứng cứ: '.length)))];
}

export function maintenanceCost(record: {
  actualCostVnd?: Prisma.Decimal | null;
  costConfirmedAt?: Date | null;
}) {
  const actual = record.actualCostVnd;
  return {
    actualVnd: actual?.toFixed(0) ?? null,
    status: record.costConfirmedAt ? 'CONFIRMED' : actual != null ? 'PENDING' : 'UNRECORDED',
  };
}

const auditFields: Record<string, readonly string[]> = {
  MAINTENANCE_REPAIR_PLANNED: ['surveyResult', 'repairPlan', 'repairMethod'],
  MAINTENANCE_COST_PROPOSED: ['actualVnd', 'evidenceLinks'],
  MAINTENANCE_COST_CONFIRMED: ['actualVnd', 'status', 'proposedVnd', 'approvedIds'],
  MAINTENANCE_COST_RETURNED: ['actualVnd', 'status', 'evidenceLinks', 'note'],
  MAINTENANCE_COST_ADJUSTED: ['before', 'after', 'firstConfirmedAt', 'reason'],
};

function pickAuditFields(data: Prisma.JsonValue, fields: readonly string[]) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.fromEntries(fields.filter(field => Object.hasOwn(data, field)).map(field => [field, data[field]]));
}

/** Keep the audit rows intact and expose only the fields used by the current workflow. */
export function maintenanceAuditDetail(action: string, data: Prisma.JsonValue) {
  const detail = pickAuditFields(data, auditFields[action] ?? []);
  if (action !== 'MAINTENANCE_COST_ADJUSTED') return detail;
  return {
    ...detail,
    before: pickAuditFields(detail.before ?? null, ['actualVnd', 'status']),
    after: pickAuditFields(detail.after ?? null, ['actualVnd', 'status']),
  };
}
