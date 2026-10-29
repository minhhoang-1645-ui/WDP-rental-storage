import { describe, expect, it } from 'vitest';
import { invoiceSigningRequirements } from './payment-eligibility.js';

describe('invoice signing guidance', () => {
  const signed = { id: 'one', contractCode: 'C01', termsAcceptedAt: new Date() };
  const unsigned = { id: 'two', contractCode: 'C02', termsAcceptedAt: null };
  it('points to the unsigned contract and requires all N contracts', () => {
    expect(invoiceSigningRequirements({ type: 'INITIAL', reservation: { quantity: 2, contracts: [signed, unsigned] } })).toMatchObject({ complete: false, contracts: [{ id: 'two', code: 'C02' }] });
    expect(invoiceSigningRequirements({ type: 'INITIAL', reservation: { quantity: 2, contracts: [signed] } }).complete).toBe(false);
    expect(invoiceSigningRequirements({ type: 'INITIAL', reservation: { quantity: 0, contracts: [] } }).complete).toBe(false);
    expect(invoiceSigningRequirements({ type: 'INITIAL', reservation: { quantity: 1, contracts: [signed] } }).complete).toBe(true);
  });
  it('requires the matching appendix but preserves completed historical renewals', () => {
    const invoice = { type: 'RENEWAL', reservation: { quantity: 1, contracts: [signed] }, renewalRequest: { id: 'renewal', status: 'APPROVED_PENDING_PAYMENT', appendixAcceptedAt: null } };
    expect(invoiceSigningRequirements(invoice)).toMatchObject({ complete: false, renewalId: 'renewal' });
    expect(invoiceSigningRequirements({ ...invoice, renewalRequest: { ...invoice.renewalRequest, appendixAcceptedAt: new Date() } }).complete).toBe(true);
    expect(invoiceSigningRequirements({ ...invoice, renewalRequest: { ...invoice.renewalRequest, status: 'COMPLETED' } }).complete).toBe(true);
    expect(invoiceSigningRequirements({ ...invoice, renewalRequest: null }).complete).toBe(false);
  });
  it('does not require a new signature for recurring or settlement invoices', () => {
    for (const type of ['RECURRING', 'SETTLEMENT']) expect(invoiceSigningRequirements({ type, reservation: { quantity: 1, contracts: [unsigned] } })).toMatchObject({ required: false, complete: true });
  });
});
