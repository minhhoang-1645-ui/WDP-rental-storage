import { afterEach, describe, expect, it, vi } from 'vitest';
import { SigningOtpService, signedDocument, signedEnvelope, signatureVerification, type SigningContext } from './signing-otp.service.js';

const context: SigningContext = { userId: 'own-user', email: 'customer@example.test', kind: 'contract', documentId: 'contract-A', documentHash: 'hash-A', signatureImage: 'png-A', acceptanceName: 'Nguyễn Văn An' };
function setup(configured = true) {
  let delivered = '';
  const sender = { signatureDeliveryConfigured: () => configured, sendSignatureOtp: vi.fn(async (mail: any) => { delivered = mail.code; }) };
  const service = new SigningOtpService(sender as any);
  return { service, sender, code: () => delivered };
}
afterEach(() => vi.useRealTimers());
describe('Signature OTP', () => {
  it('blocks unconfigured/development delivery without returning a fake OTP', async () => { const { service, sender } = setup(false); await expect(service.issue(context)).rejects.toThrow('Chưa cấu hình'); expect(sender.sendSignatureOtp).not.toHaveBeenCalled(); });
  it('binds the exact document, identity, name and drawn signature; never exposes OTP', async () => {
    const { service, code } = setup(); const receipt = await service.issue(context);
    expect(receipt).not.toHaveProperty('code'); expect(receipt).not.toHaveProperty('otp'); expect(receipt.recipient).toBe('cu***@example.test');
    for (const changed of [{ userId: 'another-user' }, { documentId: 'another-contract' }, { documentHash: 'new-hash' }, { signatureImage: 'other-png' }, { acceptanceName: 'Khác' }]) expect(() => service.acquire({ ...context, ...changed }, { challengeId: receipt.challengeId, otp: code() })).toThrow('không thuộc');
    const proof = service.acquire(context, { challengeId: receipt.challengeId, otp: code() }); expect(proof.evidence.documentHash).toBe(context.documentHash);
    expect(() => service.acquire(context, { challengeId: receipt.challengeId, otp: code() })).toThrow('đang được lưu');
    proof.commit(); expect(() => service.acquire(context, { challengeId: receipt.challengeId, otp: code() })).toThrow();
  });
  it('allows retry after a database failure without accepting concurrently', async () => { const { service, code } = setup(); const receipt = await service.issue(context); const input = { challengeId: receipt.challengeId, otp: code() }; service.acquire(context, input).release(); service.acquire(context, input).commit(); });
  it('expires at 10 minutes and stops after five incorrect guesses', async () => {
    vi.useFakeTimers(); const { service } = setup(); const receipt = await service.issue(context);
    for (let i = 0; i < 5; i++) expect(() => service.acquire(context, { challengeId: receipt.challengeId, otp: 'invalid' })).toThrow('không đúng');
    expect(() => service.acquire(context, { challengeId: receipt.challengeId, otp: '123456' })).toThrow('vượt quá');
    vi.advanceTimersByTime(61_000); const next = await service.issue(context); vi.advanceTimersByTime(600_000);
    expect(() => service.acquire(context, { challengeId: next.challengeId, otp: '123456' })).toThrow('hết hạn');
  });
  it('rate limits resends including concurrent requests', async () => { const { service, sender } = setup(); const results = await Promise.allSettled([service.issue(context), service.issue(context)]); expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(sender.sendSignatureOtp).toHaveBeenCalledTimes(1); });
  it('invalidates earlier codes for the document when the customer re-signs', async () => { vi.useFakeTimers(); const { service, code } = setup(); const first = await service.issue(context), oldCode = code(); await service.issue({ ...context, documentId: 'another-contract' }); vi.advanceTimersByTime(61_000); const changed = { ...context, signatureImage: 'new-png' }; const second = await service.issue(changed); expect(() => service.acquire(context, { challengeId: first.challengeId, otp: oldCode })).toThrow(); service.acquire(changed, { challengeId: second.challengeId, otp: code() }).commit(); });
  it('keeps legacy signed snapshots unchanged and records new evidence separately', async () => { const { service, code } = setup(); const receipt = await service.issue(context); const proof = service.acquire(context, { challengeId: receipt.challengeId, otp: code() }); const document = { price: 650_000 }; const envelope = signedEnvelope(document, proof.evidence); expect(signedDocument(document)).toBe(document); expect(signatureVerification(document)).toBeNull(); expect(signedDocument(envelope)).toBe(document); expect(signatureVerification(envelope)?.method).toBe('EMAIL_OTP'); });
});
