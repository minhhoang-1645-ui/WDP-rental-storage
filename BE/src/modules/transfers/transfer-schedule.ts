import { BadRequestException } from '@nestjs/common';

// Proposal windows for the facility. Availability is determined during review.
export const transferProposalSlots = [
  { start: '08:00', end: '10:00' },
  { start: '10:00', end: '12:00' },
  { start: '13:00', end: '15:00' },
  { start: '15:00', end: '17:00' },
];

export function parseTransferProposal(input: Record<string, unknown>, isTransfer: boolean) {
  const day = input.transferRequestedDate;
  const start = input.transferRequestedSlot;
  if (day === undefined && start === undefined) return null;
  const slot = transferProposalSlots.find(item => item.start === start);
  const calendarDay = typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? new Date(`${day}T00:00:00Z`) : null;
  if (!isTransfer || !slot || !calendarDay || !Number.isFinite(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== day) {
    throw new BadRequestException('Ngày hoặc khung giờ chuyển kho không hợp lệ.');
  }

  return {
    startAt: new Date(`${day}T${slot.start}:00+07:00`),
    endAt: new Date(`${day}T${slot.end}:00+07:00`),
    calendarDay,
  };
}

export function transferProposalView(record: { transferRequestedStartAt?: Date | null; transferRequestedEndAt?: Date | null } | null | undefined) {
  if (!record?.transferRequestedStartAt || !record.transferRequestedEndAt) return null;
  return { startAt: record.transferRequestedStartAt.toISOString(), endAt: record.transferRequestedEndAt.toISOString() };
}
