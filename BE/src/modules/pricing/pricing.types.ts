export type PaymentPlan = 'PAY_MONTHLY' | 'PREPAID';
export type BillingMode = 'DAILY' | 'MONTHLY';

export interface PricingInput {
  storageTypeId: string;
  quantity: number;
  startDate: string;
  endDate: string;
  paymentPlan: PaymentPlan;
}

export interface PricingQuote {
  currency: 'VND';
  storageTypeId: string;
  storageTypeName: string;
  quantity: number;
  startDate: string;
  endDate: string;
  billingMode: BillingMode;
  billableDays: number | null;
  termMonths: number | null;
  paymentPlan: PaymentPlan;
  monthlyUnitPrice: number;
  dailyUnitPrice: string | null;
  baseRentalAmount: number;
  discountPercent: number;
  discountAmount: number;
  rentalAmount: number;
  depositAmount: number;
  quotedTotalAmount: number;
  status: 'PRICED';
  periodStatus: 'APPROVED_DURATION' | 'SHORT_DURATION_APPROVED';
  lineItems: Array<{ code: string; label: string; basis: string; amount: number; status: 'INCLUDED' }>;
  rentalSubtotal: number;
  deposit: number;
  applicableFees: null;
  taxes: null;
  discounts: number;
  grandTotal: number;
  amountPayableNow: null;
  message: string;
}
