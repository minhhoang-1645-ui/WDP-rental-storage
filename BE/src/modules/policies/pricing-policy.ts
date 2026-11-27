import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

export const depositGroups = ['locker', 'smallDaily', 'other'] as const;
export const prepaidTerms = [3, 6, 12] as const;
export const depositMethods = ['NONE', 'FIXED_AMOUNT', 'RENT_PERCENTAGE', 'MONTHLY_RENT_MULTIPLIER'] as const;
export const returnNoticeRange = { defaultValue: 7, min: 0, max: 30 } as const;
export const DEPOSIT_REFUND_DAYS = 7;

type DepositMethod = (typeof depositMethods)[number];
type DepositRule = { method: DepositMethod; amount: number };
type DepositRules = Record<(typeof depositGroups)[number], DepositRule>;
type PrepaidRules = Record<(typeof prepaidTerms)[number], { enabled: boolean; percent: number }>;
export type RenewalPolicy = {
  opensDaysBefore: number;
  closesDaysBefore: number;
  priceMode: 'CURRENT_LIST_PRICE' | 'CONTRACT_RATE';
};
export const earlyReturnFeeMethods = ['NONE', 'FIXED_AMOUNT', 'UNUSED_RENT_PERCENTAGE'] as const;
export const earlyReturnRefundModes = ['NONE', 'ORIGINAL_DISCOUNT', 'RECALCULATE_DISCOUNT'] as const;
export type EarlyReturnPolicy = {
  feeMethod: (typeof earlyReturnFeeMethods)[number];
  feeAmount: number;
  refundMode: (typeof earlyReturnRefundModes)[number];
};
export type PaymentOverduePolicy = { graceDays: number; managerDays: number; feeMethod: 'NONE' | 'FIXED_AMOUNT' | 'RENT_DEBT_PERCENTAGE'; feeAmount: number };
export type CancellationPolicy = { farDays: number; nearDays: number; farPercent: number; middlePercent: number; nearPercent: number; startedPercent: number; refundDays: number };
export type ReturnOverduePolicy = { graceDays: number; managerDays: number; multiplier: number };
export type TransferFeePolicy = { method: 'NONE' | 'FIXED_AMOUNT' | 'DESTINATION_MONTHLY_PERCENTAGE'; amount: number };
type PricingPolicyValues = { deposit: DepositRules; prepaid: PrepaidRules; renewal: RenewalPolicy; earlyReturn: EarlyReturnPolicy; paymentOverdue: PaymentOverduePolicy; cancellation: CancellationPolicy; returnOverdue: ReturnOverduePolicy };
export type PricingPolicyKey = keyof PricingPolicyValues;
export type PricingPolicySnapshot = {
  [K in 'deposit' | 'prepaid' | 'renewal']: { version: number; value: PricingPolicyValues[K] };
} & { [K in 'earlyReturn' | 'paymentOverdue' | 'cancellation' | 'returnOverdue']?: { version: number; value: PricingPolicyValues[K] } } & {
  // Existing booking snapshots use this field to opt into commercial transfer settlement.
  transferFee?: { version: number; value: TransferFeePolicy };
  returnNotice?: { version: number; value: number };
};

export const pricingPolicyDefaults: PricingPolicyValues = {
  deposit: {
    locker: { method: 'NONE', amount: 0 },
    smallDaily: { method: 'RENT_PERCENTAGE', amount: 100 },
    other: { method: 'MONTHLY_RENT_MULTIPLIER', amount: 1 },
  },
  prepaid: {
    3: { enabled: true, percent: 5 },
    6: { enabled: true, percent: 10 },
    12: { enabled: true, percent: 15 },
  },
  renewal: { opensDaysBefore: 30, closesDaysBefore: 1, priceMode: 'CURRENT_LIST_PRICE' },
  earlyReturn: { feeMethod: 'NONE', feeAmount: 0, refundMode: 'RECALCULATE_DISCOUNT' },
  paymentOverdue: { graceDays: 5, managerDays: 15, feeMethod: 'NONE', feeAmount: 0 },
  cancellation: { farDays: 7, nearDays: 3, farPercent: 100, middlePercent: 90, nearPercent: 70, startedPercent: 50, refundDays: 7 },
  returnOverdue: { graceDays: 0, managerDays: 7, multiplier: 100 },
};

export const baselinePricingPolicy: PricingPolicySnapshot = {
  deposit: { version: 0, value: pricingPolicyDefaults.deposit },
  prepaid: { version: 0, value: pricingPolicyDefaults.prepaid },
  renewal: { version: 0, value: pricingPolicyDefaults.renewal },
  earlyReturn: { version: 0, value: pricingPolicyDefaults.earlyReturn },
  paymentOverdue: { version: 0, value: pricingPolicyDefaults.paymentOverdue },
  cancellation: { version: 0, value: pricingPolicyDefaults.cancellation },
  returnOverdue: { version: 0, value: pricingPolicyDefaults.returnOverdue },
  transferFee: { version: 0, value: { method: 'NONE', amount: 0 } },
  returnNotice: { version: 0, value: returnNoticeRange.defaultValue },
};

function fields(value: unknown, expected: readonly (string | number)[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) {
    throw new BadRequestException('Cấu hình chính sách thiếu trường hoặc có trường không được hỗ trợ.');
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, max: number) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new BadRequestException('Giá trị chính sách phải là số nguyên không âm trong phạm vi hỗ trợ.');
  }
  return value;
}

function validateDeposit(input: unknown): DepositRules {
  const value = fields(input, depositGroups);
  const rule = (group: (typeof depositGroups)[number]): DepositRule => {
    const { method, amount } = fields(value[group], ['method', 'amount']);
    const selected = depositMethods.find(option => option === method);
    if (!selected) throw new BadRequestException('Phương thức đặt cọc không hợp lệ.');
    const max = selected === 'NONE' ? 0 : selected === 'RENT_PERCENTAGE' ? 100 : Number.MAX_SAFE_INTEGER;
    return { method: selected, amount: integer(amount, max) };
  };
  return { locker: rule('locker'), smallDaily: rule('smallDaily'), other: rule('other') };
}

function validatePrepaid(input: unknown): PrepaidRules {
  const value = fields(input, prepaidTerms);
  const rule = (term: (typeof prepaidTerms)[number]) => {
    const { enabled, percent } = fields(value[term], ['enabled', 'percent']);
    if (typeof enabled !== 'boolean') throw new BadRequestException('Trạng thái ưu đãi không hợp lệ.');
    return { enabled, percent: integer(percent, 30) };
  };
  return { 3: rule(3), 6: rule(6), 12: rule(12) };
}

function validateRenewal(input: unknown): RenewalPolicy {
  const value = fields(input, ['opensDaysBefore', 'closesDaysBefore', 'priceMode']);
  const opensDaysBefore = integer(value.opensDaysBefore, 90);
  const closesDaysBefore = integer(value.closesDaysBefore, 7);
  if (opensDaysBefore < 7 || opensDaysBefore <= closesDaysBefore) {
    throw new BadRequestException('Mốc mở gia hạn phải từ 7 đến 90 ngày và sớm hơn hạn cuối.');
  }
  if (value.priceMode !== 'CURRENT_LIST_PRICE' && value.priceMode !== 'CONTRACT_RATE') {
    throw new BadRequestException('Cách áp dụng đơn giá gia hạn không hợp lệ.');
  }
  return { opensDaysBefore, closesDaysBefore, priceMode: value.priceMode };
}

function validateEarlyReturn(input: unknown): EarlyReturnPolicy {
  const value = fields(input, ['feeMethod', 'feeAmount', 'refundMode']);
  const feeMethod = earlyReturnFeeMethods.find(method => method === value.feeMethod);
  const refundMode = earlyReturnRefundModes.find(mode => mode === value.refundMode);
  if (!feeMethod || !refundMode) throw new BadRequestException('Phương thức quyết toán trả trước hạn không hợp lệ.');
  const max = feeMethod === 'NONE' ? 0 : feeMethod === 'UNUSED_RENT_PERCENTAGE' ? 100 : Number.MAX_SAFE_INTEGER;
  return { feeMethod, feeAmount: integer(value.feeAmount, max), refundMode };
}

function validatePaymentOverdue(input: unknown): PaymentOverduePolicy {
  const { graceDays, managerDays, feeMethod, feeAmount } = fields(input, ['graceDays', 'managerDays', 'feeMethod', 'feeAmount']);
  const grace = integer(graceDays, 30);
  const escalation = integer(managerDays, 60);
  if (!escalation || escalation < grace) throw new BadRequestException('Mốc chuyển quản lý phải từ 1 đến 60 ngày và không sớm hơn mốc hết thời gian cho phép quá hạn.');
  if (feeMethod !== 'NONE' && feeMethod !== 'FIXED_AMOUNT' && feeMethod !== 'RENT_DEBT_PERCENTAGE') throw new BadRequestException('Phương thức tính phí chậm thanh toán không hợp lệ.');
  const max = feeMethod === 'NONE' ? 0 : feeMethod === 'RENT_DEBT_PERCENTAGE' ? 100 : Number.MAX_SAFE_INTEGER;
  return { graceDays: grace, managerDays: escalation, feeMethod, feeAmount: integer(feeAmount, max) };
}

function validateCancellation(input: unknown): CancellationPolicy {
  const value = fields(input, ['farDays', 'nearDays', 'farPercent', 'middlePercent', 'nearPercent', 'startedPercent', 'refundDays']);
  const farDays = integer(value.farDays, 365), nearDays = integer(value.nearDays, 364);
  const farPercent = integer(value.farPercent, 100), middlePercent = integer(value.middlePercent, farPercent);
  const nearPercent = integer(value.nearPercent, middlePercent), startedPercent = integer(value.startedPercent, nearPercent);
  const refundDays = integer(value.refundDays, 30);
  if (!nearDays || farDays <= nearDays || !refundDays) throw new BadRequestException('Mốc hoàn tiền phải theo đúng thứ tự; hạn xử lý từ 1 đến 30 ngày.');
  return { farDays, nearDays, farPercent, middlePercent, nearPercent, startedPercent, refundDays };
}

function validateReturnOverdue(input: unknown): ReturnOverduePolicy {
  const value = fields(input, ['graceDays', 'managerDays', 'multiplier']);
  const graceDays = integer(value.graceDays, 7), managerDays = integer(value.managerDays, 30), multiplier = integer(value.multiplier, 150);
  if (!managerDays || managerDays < graceDays || multiplier < 100) throw new BadRequestException('Mốc quản lý phải từ 1 đến 30 ngày và hệ số từ 100% đến 150%.');
  return { graceDays, managerDays, multiplier };
}

export const pricingPolicyValidators = { deposit: validateDeposit, prepaid: validatePrepaid, renewal: validateRenewal, earlyReturn: validateEarlyReturn, paymentOverdue: validatePaymentOverdue, cancellation: validateCancellation, returnOverdue: validateReturnOverdue };

export async function loadPricingPolicy(db: Pick<Prisma.TransactionClient, 'businessRule'>, asOf = new Date()): Promise<PricingPolicySnapshot> {
  const rows = await db.businessRule.findMany({
    where: {
      key: { in: [...Object.keys(pricingPolicyValidators), 'returnNoticeDays'] }, facilityId: null, storageTypeId: null,
      effectiveFrom: { lte: asOf }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
    },
    orderBy: { version: 'desc' },
  });
  const deposit = rows.find(row => row.key === 'deposit');
  const prepaid = rows.find(row => row.key === 'prepaid');
  const renewal = rows.find(row => row.key === 'renewal');
  const earlyReturn = rows.find(row => row.key === 'earlyReturn');
  const paymentOverdue = rows.find(row => row.key === 'paymentOverdue');
  const cancellation = rows.find(row => row.key === 'cancellation');
  const returnOverdue = rows.find(row => row.key === 'returnOverdue');
  const returnNotice = rows.find(row => row.key === 'returnNoticeDays');
  return {
    deposit: deposit ? { version: deposit.version, value: validateDeposit(deposit.value) } : baselinePricingPolicy.deposit,
    prepaid: prepaid ? { version: prepaid.version, value: validatePrepaid(prepaid.value) } : baselinePricingPolicy.prepaid,
    renewal: renewal ? { version: renewal.version, value: validateRenewal(renewal.value) } : baselinePricingPolicy.renewal,
    earlyReturn: earlyReturn ? { version: earlyReturn.version, value: validateEarlyReturn(earlyReturn.value) } : baselinePricingPolicy.earlyReturn,
    paymentOverdue: paymentOverdue ? { version: paymentOverdue.version, value: validatePaymentOverdue(paymentOverdue.value) } : baselinePricingPolicy.paymentOverdue,
    cancellation: cancellation ? { version: cancellation.version, value: validateCancellation(cancellation.value) } : baselinePricingPolicy.cancellation,
    returnOverdue: returnOverdue ? { version: returnOverdue.version, value: validateReturnOverdue(returnOverdue.value) } : baselinePricingPolicy.returnOverdue,
    transferFee: baselinePricingPolicy.transferFee,
    returnNotice: returnNotice ? { version: returnNotice.version, value: integer(returnNotice.value, returnNoticeRange.max) } : baselinePricingPolicy.returnNotice,
  };
}
