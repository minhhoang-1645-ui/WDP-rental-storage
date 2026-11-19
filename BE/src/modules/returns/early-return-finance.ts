import { ConflictException } from '@nestjs/common';

interface InvoiceDebt { status: string; balanceDue: bigint | number; invoiceCode?: string }
export const RETURN_SETTLEMENT_POLICY = 'FULL_SETTLEMENT_REQUIRED';
export const RETURN_SETTLEMENT_MESSAGE = 'Trả trước hạn hoặc đúng hạn đều phải thanh toán đủ toàn bộ công nợ, gồm các kỳ thuê đã cam kết chưa đến hạn, trước khi gửi yêu cầu và hoàn tất trả kho.';

/** Every effective invoice counts, regardless of due date or payment submission status. */
export function returnReadiness(invoices?: InvoiceDebt[] | null) {
  const effective = invoices?.filter(invoice => invoice.status !== 'VOID');
  const amounts = effective?.map(invoice => Number(invoice.balanceDue));
  const valid = !!amounts && amounts.every(amount => Number.isSafeInteger(amount) && amount >= 0);
  const totalOutstanding = valid ? amounts!.reduce((sum, amount) => sum + amount, 0) : null;
  const ledgerAvailable = totalOutstanding !== null && Number.isSafeInteger(totalOutstanding);
  return { policy: RETURN_SETTLEMENT_POLICY, requiresFullSettlement: true,
    totalOutstanding: ledgerAvailable ? totalOutstanding : null,
    unpaidInvoiceCount: effective?.filter(invoice => Number(invoice.balanceDue) > 0).length ?? 0,
    canReturn: ledgerAvailable && totalOutstanding === 0 };
}
export function assertReturnFullyPaid(invoices?: InvoiceDebt[] | null, showAmounts = true) {
  const readiness = returnReadiness(invoices);
  if (!readiness.canReturn) throw new ConflictException({ code: 'RETURN_UNPAID_INVOICES', message: RETURN_SETTLEMENT_MESSAGE,
    ...(showAmounts ? readiness : { canReturn: readiness.canReturn }) });
}
/** Reject stale clients attempting the retired waiver flow. */
export function assertFullSettlementPolicyInput(input: Record<string, unknown>) {
  if (input.financialDisposition !== undefined && input.financialDisposition !== 'KEEP') throw new ConflictException({ code: 'RETURN_DEBT_WAIVER_DISABLED', message: RETURN_SETTLEMENT_MESSAGE });
}
