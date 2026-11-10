export interface ManagerReport {
  asOf: string;
  period: { from: string | null; to: string | null; timeZone: string };
  units: { total: number; available: number; occupied: number; maintenance: number; reserved: number; utilizationPercent: number | null };
  activeContracts: number;
  finance: { unpaidInvoices: number; outstandingAmount: number; collectedAmount: number; paymentCount: number; depositOnFullyPaidInvoices: number; approvedRefundOutstanding: number };
  queue: Record<string, number>;
  workload: { id: string; fullName: string; accountStatus: string; stock: number; support: number; maintenance: number }[];
}
