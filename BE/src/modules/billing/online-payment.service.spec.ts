import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OnlinePaymentService } from './online-payment.service.js';

const customer = { id: 'customer-1', role: 'CUSTOMER' } as never;

function fixture(transactionStatus: 'PENDING' | 'SUCCESS' | 'EXPIRED' = 'PENDING') {
  const transaction = { id: 'transaction-1', invoiceId: 'invoice-1', amount: 650000n, status: transactionStatus };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    onlinePaymentTransaction: {
      findUnique: vi.fn().mockResolvedValue(transaction),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ ...transaction, merchantOrderRef: 'WDP-ORDER-1', createdAt: new Date() }),
      update: vi.fn().mockResolvedValue({ ...transaction, status: 'SUCCESS' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    onlinePaymentReconciliation: {
      upsert: vi.fn().mockResolvedValue({ id: 'reconciliation-1' }),
    },
    invoice: {
      findUnique: vi.fn().mockResolvedValue({ id: 'invoice-1', type: 'INITIAL', status: 'OPEN', balanceDue: 650000n, reservation: { id: 'reservation-1', customerId: 'customer-1', status: 'CONFIRMED', expiresAt: new Date(Date.now() + 60_000) } }),
    },
  };
  const prisma = {
    onlinePaymentTransaction: {
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({ id: 'transaction-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const billing = { recordVerifiedOnlinePayment: vi.fn().mockResolvedValue({}) };
  const vnpay = {
    assertConfigured: vi.fn(),
    paymentUrl: vi.fn().mockReturnValue('https://sandbox.vnpayment.vn/test'),
    verify: vi.fn().mockReturnValue({
      orderRef: 'WDP-ORDER-1',
      amountMinor: 65000000n,
      responseCode: '00',
      transactionStatus: '00',
      providerTransactionId: 'provider-1',
      bankCode: 'VNPAYQR',
    }),
  };
  return {
    service: new OnlinePaymentService(prisma as never, billing as never, vnpay as never),
    prisma,
    billing,
    vnpay,
    tx,
  };
}

describe('OnlinePaymentService VNPay status and callbacks', () => {
  it('returns a stable customer-owned polling response', async () => {
    const { service, prisma } = fixture();
    prisma.onlinePaymentTransaction.findFirst.mockResolvedValue({
      id: 'transaction-1',
      merchantOrderRef: 'WDP-ORDER-1',
      status: 'PENDING',
      amount: 650000n,
      createdAt: new Date(),
      paidAt: null,
      updatedAt: new Date('2026-10-24T02:00:00.000Z'),
      invoice: { id: 'invoice-1', invoiceCode: 'INV-1', type: 'INITIAL', status: 'OPEN', amountPaid: 0n, balanceDue: 650000n, paidAt: null },
      payment: null,
    });

    await expect(service.getCustomerStatus('transaction-1', customer)).resolves.toMatchObject({
      transactionId: 'transaction-1',
      status: 'PENDING',
      providerStatus: 'PENDING',
      amount: 650000,
      expiresAt: expect.any(String),
      invoice: { status: 'OPEN', amountPaid: 0, balanceDue: 650000 },
      payment: null,
    });
    expect(prisma.onlinePaymentTransaction.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ customerUserId: 'customer-1' }),
    }));
  });

  it('expires a stale pending transaction while keeping the invoice unpaid', async () => {
    const { service, prisma } = fixture();
    prisma.onlinePaymentTransaction.findFirst.mockResolvedValue({
      id: 'transaction-1', merchantOrderRef: 'WDP-ORDER-1', status: 'PENDING', amount: 650000n,
      createdAt: new Date(Date.now() - 16 * 60_000), paidAt: null, updatedAt: new Date(),
      invoice: { id: 'invoice-1', invoiceCode: 'INV-1', type: 'INITIAL', status: 'OPEN', amountPaid: 0n, balanceDue: 650000n, paidAt: null },
      payment: null,
    });
    await expect(service.getCustomerStatus('transaction-1', customer)).resolves.toMatchObject({
      status: 'FAILED', providerStatus: 'EXPIRED', invoice: { status: 'OPEN' },
    });
    expect(prisma.onlinePaymentTransaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'EXPIRED' } }));
  });

  it('does not reveal another customer transaction', async () => {
    const { service } = fixture();
    await expect(service.getCustomerStatus('other-transaction', customer)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects non-customer access at the service boundary', async () => {
    const { service } = fixture();
    await expect(service.getCustomerStatus('transaction-1', { id: 'manager-1', role: 'MANAGER' } as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records a successful signed IPN once', async () => {
    const { service, billing, tx } = fixture();
    await expect(service.processIpn({ vnp_TxnRef: 'WDP-ORDER-1' })).resolves.toEqual({ RspCode: '00', Message: 'Confirm Success' });
    expect(billing.recordVerifiedOnlinePayment).toHaveBeenCalledOnce();
    expect(tx.onlinePaymentTransaction.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) }));
  });

  it('does not activate an expired reservation when a successful IPN arrives late', async () => {
    const { service, billing, tx } = fixture('EXPIRED');
    tx.invoice.findUnique.mockResolvedValueOnce({
      id: 'invoice-1', type: 'INITIAL', status: 'VOID', balanceDue: 0n,
      reservation: { id: 'reservation-1', status: 'EXPIRED', expiresAt: new Date(Date.now() - 60_000) },
    });
    await expect(service.processIpn({ vnp_TxnRef: 'WDP-ORDER-1' })).resolves.toEqual({ RspCode: '00', Message: 'Confirm Success - reconciliation required' });
    expect(billing.recordVerifiedOnlinePayment).not.toHaveBeenCalled();
    expect(tx.onlinePaymentTransaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(tx.onlinePaymentReconciliation.upsert).toHaveBeenCalledOnce();
  });

  it('reuses the active payment session for the same invoice', async () => {
    const { service, prisma, tx } = fixture();
    prisma.invoice = { findFirst: vi.fn().mockResolvedValue({ id: 'invoice-1' }) } as never;
    prisma.onlinePaymentTransaction.findUnique.mockResolvedValueOnce(null);
    tx.onlinePaymentTransaction.findFirst.mockResolvedValueOnce({
      id: 'active-transaction', invoiceId: 'invoice-1', customerUserId: 'customer-1', amount: 650000n,
      merchantOrderRef: 'WDP-ACTIVE', status: 'PENDING', createdAt: new Date(),
    });
    await expect(service.create('invoice-1', {}, 'payment-new-key', customer, '127.0.0.1')).resolves.toMatchObject({
      transactionId: 'active-transaction', merchantOrderRef: 'WDP-ACTIVE', status: 'PENDING',
    });
    expect(tx.onlinePaymentTransaction.create).not.toHaveBeenCalled();
  });

  it('acknowledges a repeated successful IPN without recording again', async () => {
    const { service, billing, tx } = fixture('SUCCESS');
    await expect(service.processIpn({ vnp_TxnRef: 'WDP-ORDER-1' })).resolves.toEqual({ RspCode: '00', Message: 'Confirm Success' });
    expect(billing.recordVerifiedOnlinePayment).not.toHaveBeenCalled();
    expect(tx.onlinePaymentTransaction.update).not.toHaveBeenCalled();
  });

  it('keeps browser return read-only while IPN is pending', async () => {
    const { service, prisma, billing } = fixture();
    prisma.onlinePaymentTransaction.findUnique.mockResolvedValueOnce({
      merchantOrderRef: 'WDP-ORDER-1', status: 'PENDING', amount: 650000n,
      invoice: { invoiceCode: 'INV-1', status: 'OPEN' },
    });
    await expect(service.returnStatus({ vnp_TxnRef: 'WDP-ORDER-1' })).resolves.toMatchObject({ valid: true, transaction: { status: 'PENDING' }, invoice: { status: 'OPEN' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(billing.recordVerifiedOnlinePayment).not.toHaveBeenCalled();
  });
});
