export interface RentalPeriodSummary {
  originalStartDate: string; originalEndDate: string; originalMonths: number | null;
  currentStartDate: string; currentEndDate: string; extendedMonths: number; totalMonths: number | null;
}
export interface RentalInvoiceLine {
  id: string; code: string; type: string; renewalId: string | null; status: string;
  periodStart: string | null; periodEnd: string | null; dueAt: string | null;
  rental: number; deposit: number; services: number; charges: number;
  total: number; paid: number; balance: number; dueState: string;
}
export interface RentalPaymentDetails {
  totalInvoiced: number; totalPaid: number; totalOutstanding: number;
  groups: Array<{ type: string; title: string; total: number; paid: number; balance: number; invoices: RentalInvoiceLine[] }>;
}
