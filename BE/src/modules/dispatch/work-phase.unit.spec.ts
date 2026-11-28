import { describe, expect, it } from 'vitest';
import { workPhase } from './work-phase.js';

describe('dispatch work phase', () => {
  const staff = { assignedStaffUserId: 'staff' };

  it('separates unassigned, assigned and in progress', () => {
    expect(workPhase('support-requests', { status: 'OPEN' }).phase).toBe('UNASSIGNED');
    expect(workPhase('support-requests', { ...staff, status: 'ASSIGNED' }).phase).toBe('ASSIGNED');
    expect(workPhase('support-requests', { ...staff, status: 'IN_PROGRESS' }).phase).toBe('IN_PROGRESS');
  });

  it('excludes waits and the Manager’s financial work from active Staff load', () => {
    expect(workPhase('transfers', { ...staff, status: 'APPROVED', awaitingCustomer: true })).toEqual({ phase: 'WAITING', waitReason: 'CUSTOMER' });
    expect(workPhase('maintenance', { ...staff, status: 'AWAITING_VERIFICATION' })).toEqual({ phase: 'WAITING', waitReason: 'MANAGER' });
    expect(workPhase('returns', { ...staff, status: 'PENDING_SETTLEMENT' }).phase).toBe('STAFF_DONE');
    expect(workPhase('damage-claims', { ...staff, status: 'INVESTIGATING', staffFacts: {} }).phase).toBe('STAFF_DONE');
  });

  it('keeps future and unsafe appointments out of ready work', () => {
    const now = new Date('2026-11-25T08:00:00Z');
    const scheduledAt = new Date('2026-11-25T09:00:00Z');
    expect(workPhase('appointments', { status: 'CONFIRMED', scheduledAt }, now).waitReason).toBe('SCHEDULE');
    expect(workPhase('appointments', { status: 'CONFIRMED', scheduledAt, safetyBlocked: true }, now).waitReason).toBe('SAFETY');
    expect(workPhase('appointments', { status: 'CONFIRMED', scheduledAt: now }, now).phase).toBe('UNASSIGNED');
  });
});
