import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { AccountOnboardingService } from './account-onboarding.service.js';
import { GuestBookingService } from './guest-booking.service.js';
import { AuthService } from '../auth/auth.service.js';
import { MemoryUserRepository } from '../users/user.repository.js';
import { ConflictException, ForbiddenException } from '@nestjs/common';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function fixture() {
  const guest = { id: 'g', bookingCode: 'WDPG-fixture', email: 'guest@example.test', fullName: 'Guest Name', phone: '0900000000', status: 'PENDING_VERIFICATION', claimTokenHash: hash('v'.repeat(40)), claimTokenExpiresAt: new Date(Date.now() + 60000), storageType: { name: 'Kho nhỏ' }, startDate: new Date('2026-12-01'), endDate: new Date('2027-01-01'), quantity: 2, quoteSnapshot: {}, paymentPlan: 'PREPAID' };
  const proof = { id: 'proof', tokenHash: hash('p'.repeat(40)), kind: 'ONBOARDING', email: guest.email, bookingCode: guest.bookingCode, usedAt: null as Date | null, expiresAt: new Date(Date.now() + 60000) };
  const db = {
    guestBookingRequest: { findUnique: vi.fn().mockResolvedValue(guest), findUniqueOrThrow: vi.fn().mockResolvedValue(guest), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    accountFlowToken: { findUnique: vi.fn().mockResolvedValue(proof), create: vi.fn().mockResolvedValue(proof), update: vi.fn().mockResolvedValue(proof), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    accountFlowLimit: { upsert: vi.fn().mockResolvedValue({ bucket: new Date(Math.floor(Date.now() / 900000) * 900000) }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    user: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async callback => callback(db));
  const auth = { register: vi.fn().mockResolvedValue({ token: 'session', user: { role: 'CUSTOMER', email: guest.email } }), encodePassword: vi.fn().mockResolvedValue('scrypt$hash'), revokeUserSessions: vi.fn() };
  const email = { sendPasswordReset: vi.fn().mockResolvedValue({}), sendBookingClaim: vi.fn().mockResolvedValue({}) };
  return { guest, proof, db, auth, email, service: new AccountOnboardingService(db as never, auth as never, email as never) };
}
describe('secure guest account onboarding (isolated mocks)', () => {
  it('exchanges a one-time verification link for a hashed, separate continuation proof', async () => {
    const { service, db } = fixture();
    const result = await service.verify('v'.repeat(40));
    expect(result.bookingCode).toBe('WDPG-fixture');
    expect(db.accountFlowToken.create.mock.calls[0][0].data.tokenHash).toBe(hash(result.continuationToken));
    expect(db.accountFlowToken.create.mock.calls[0][0].data).not.toHaveProperty('token');
    expect(db.guestBookingRequest.updateMany.mock.calls[0][0].data).toMatchObject({ claimTokenHash: null, status: 'VERIFIED' });
  });
  it.each(['CLAIMED', 'VERIFIED', 'EXPIRED'])('rejects reused/nonpending verification %s', async status => {
    const { service, guest, db } = fixture(); guest.status = status;
    await expect(service.verify('v'.repeat(40))).rejects.toThrow(); expect(db.accountFlowToken.create).not.toHaveBeenCalled();
  });
  it('rejects expired verification and concurrent losers atomically', async () => {
    const { service, guest, db } = fixture(); guest.claimTokenExpiresAt = new Date(0);
    await expect(service.verify('v'.repeat(40))).rejects.toThrow();
    guest.claimTokenExpiresAt = new Date(Date.now() + 60000); db.guestBookingRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.verify('v'.repeat(40))).rejects.toThrow(); expect(db.accountFlowToken.create).not.toHaveBeenCalled();
  });
  it('reveals the verified email/account branch only with a valid continuation proof', async () => {
    const { service, db, proof } = fixture();
    expect(await service.context('p'.repeat(40))).toMatchObject({ email: 'guest@example.test', existingAccount: false });
    db.user.findUnique.mockResolvedValue({ id: 'existing' });
    expect(await service.context('p'.repeat(40))).toMatchObject({ existingAccount: true });
    proof.usedAt = new Date(); await expect(service.context('p'.repeat(40))).rejects.toThrow();
  });
  it('ignores forged email/role and registers CUSTOMER using verified booking contact', async () => {
    const { service, auth, guest } = fixture(); guest.status = 'VERIFIED';
    await service.setup({ token: 'p'.repeat(40), password: 'password123', confirmPassword: 'password123', role: 'ADMIN', email: 'other@example.test' });
    expect(auth.register).toHaveBeenCalledWith({ email: guest.email, fullName: guest.fullName, phone: guest.phone, password: 'password123' });
  });
  it('rejects password mismatch, expired proof and reset proof used for onboarding', async () => {
    const { service, proof, auth } = fixture();
    await expect(service.setup({ password: 'a', confirmPassword: 'b' })).rejects.toThrow();
    proof.expiresAt = new Date(0); await expect(service.context('p'.repeat(40))).rejects.toThrow();
    proof.expiresAt = new Date(Date.now() + 60000); proof.kind = 'RESET'; await expect(service.context('p'.repeat(40))).rejects.toThrow();
    expect(auth.register).not.toHaveBeenCalled();
  });
  it('does not consume onboarding proof on duplicate registration or policy failure', async () => {
    const { service, guest, db, auth } = fixture(); guest.status = 'VERIFIED'; auth.register.mockRejectedValue(new Error('duplicate'));
    await expect(service.setup({ token: 'p'.repeat(40), password: 'password123', confirmPassword: 'password123' })).rejects.toThrow();
    expect(db.accountFlowToken.update).not.toHaveBeenCalled();
  });
  it('reset responses do not disclose account existence, tokens are hashed and emailed only', async () => {
    const { service, db, email } = fixture(); const input = { email: 'guest@example.test' };
    const absent = await service.requestReset(input); db.user.findUnique.mockResolvedValue({ id: 'u', accountStatus: 'ACTIVE' });
    const exists = await service.requestReset(input); expect(exists).toEqual(absent);
    const raw = email.sendPasswordReset.mock.calls[0][1]; expect(db.accountFlowToken.create.mock.calls[0][0].data.tokenHash).toBe(hash(raw)); expect(JSON.stringify(exists)).not.toContain(raw);
  });
  it('consumes reset once, updates only the password hash, revokes sessions', async () => {
    const { service, proof, db, auth } = fixture(); proof.kind = 'RESET'; db.user.findUnique.mockResolvedValue({ id: 'u', accountStatus: 'ACTIVE' });
    const input = { token: 'p'.repeat(40), password: 'password123', confirmPassword: 'password123' };
    await service.reset(input); expect(db.user.update.mock.calls[0][0].data).toEqual({ passwordHash: 'scrypt$hash' }); expect(auth.revokeUserSessions).toHaveBeenCalledWith('u');
    db.accountFlowToken.updateMany.mockResolvedValue({ count: 0 }); await expect(service.reset(input)).rejects.toThrow(); expect(db.user.update).toHaveBeenCalledOnce();
  });
  it('enforces distributed attempt limits', async () => {
    const { service, db } = fixture(); db.accountFlowLimit.updateMany.mockResolvedValue({ count: 0 }); await expect(service.limit('reset', 'x')).rejects.toThrow();
  });
  it('uses the real password policy, creates a Customer session and revokes sessions after recovery', async () => {
    const users = new MemoryUserRepository(), auth = new AuthService(users);
    await expect(auth.encodePassword('short')).rejects.toThrow();
    const session = await auth.register({ fullName: 'Verified Guest', email: 'new@example.test', phone: '0900000000', password: 'password123' });
    expect(session.user.role).toBe('CUSTOMER');
    await expect(auth.getUserByToken(session.token)).resolves.toMatchObject({ email: 'new@example.test' });
    await expect(auth.register({ fullName: 'Other', email: 'new@example.test', phone: '0900000000', password: 'password123' })).rejects.toThrow();
    auth.revokeUserSessions(session.user.id);
    await expect(auth.getUserByToken(session.token)).rejects.toThrow();
  });
  it('rotates expired verification links without changing a claimed booking', async () => {
    const { service, guest, email, db } = fixture(); guest.status = 'EXPIRED';
    await service.resend({ bookingCode: guest.bookingCode, email: guest.email }); expect(email.sendBookingClaim).toHaveBeenCalledOnce();
    expect(db.guestBookingRequest.updateMany.mock.calls[0][0].data.status).toBe('PENDING_VERIFICATION');
    guest.status = 'CLAIMED'; await service.resend({ bookingCode: guest.bookingCode, email: guest.email }); expect(email.sendBookingClaim).toHaveBeenCalledOnce();
  });
});

describe('existing claim business protections remain in force (mock transaction)', () => {
  const customer = { id: 'c', role: 'CUSTOMER', email: 'guest@example.test' } as const;
  function claimFixture() {
    const current = { id: 'g', email: customer.email, status: 'VERIFIED', claimedByUserId: null, reservation: null };
    const db = { guestBookingRequest: { findUnique: vi.fn().mockResolvedValue(current), update: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn() };
    db.$transaction.mockImplementation(async callback => callback(db));
    const booking = { createConfirmedReservationFromGuest: vi.fn().mockResolvedValue({ databaseId: 'r', reference: 'WDP-r' }) };
    return { current, db, booking, service: new GuestBookingService(db as never, booking as never, {} as never, {} as never, {} as never) };
  }
  it('rejects another email before reservation/allocation', async () => {
    const { service, booking } = claimFixture();
    await expect(service.claim('WDPG-fixture', { ...customer, email: 'other@example.test' } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(booking.createConfirmedReservationFromGuest).not.toHaveBeenCalled();
  });
  it('returns an already-claimed authorized reservation without creating another', async () => {
    const { service, booking, current } = claimFixture();
    Object.assign(current, { status: 'CLAIMED', claimedByUserId: 'c', reservation: { reservationCode: 'WDP-r' } });
    expect(await service.claim('WDPG-fixture', customer as never)).toMatchObject({ reservationCode: 'WDP-r' });
    expect(booking.createConfirmedReservationFromGuest).not.toHaveBeenCalled();
  });
  it.each(['REQUESTED_STORAGE_NO_LONGER_AVAILABLE', 'BOOKING_QUOTE_CHANGED'])('preserves verified request when %s blocks allocation', async code => {
    const { service, booking, db } = claimFixture(); booking.createConfirmedReservationFromGuest.mockRejectedValue(new ConflictException({ code }));
    await expect(service.claim('WDPG-fixture', customer as never)).rejects.toBeInstanceOf(ConflictException);
    expect(db.guestBookingRequest.update).not.toHaveBeenCalled();
  });
  it('uses serializable locking for concurrent claims', async () => {
    const { service, db } = claimFixture(); await service.claim('WDPG-fixture', customer as never);
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
  });
});
