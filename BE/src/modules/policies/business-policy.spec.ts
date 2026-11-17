import { describe, expect, it } from 'vitest';
import { validatePolicy } from './business-policy.service.js';
describe('Safe Admin policy boundaries', () => {
  it('never exposes a secret/configuration editor', () => {
    for (const key of ['SMTP_PASS', 'DATABASE_URL', 'VNPAY_HASH_SECRET', '__proto__']) expect(() => validatePolicy(key, 10)).toThrow();
  });
  it('accepts exact integer units and bounds only', () => {
    expect(validatePolicy('reservationHoldMinutes', 1440)).toBe(1440);
    expect(validatePolicy('handoverLeadDays', 0)).toBe(0);
    for (const value of ['3', NaN, -1, 8, 1.5, null]) expect(() => validatePolicy('handoverLeadDays', value)).toThrow();
  });
});
