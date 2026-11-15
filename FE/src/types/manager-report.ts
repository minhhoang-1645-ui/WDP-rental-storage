export interface ManagerReport {
  asOf: string;
  period: { from: string | null; to: string | null; timeZone: string };
  units: { total: number; available: number; occupied: number; maintenance: number; reserved: number; utilizationPercent: number | null };
  activeContracts: number;
  finance: { unpaidInvoices: number; outstandingAmount: number; collectedAmount: number; paymentCount: number; depositOnFullyPaidInvoices: number; approvedRefundOutstanding: number };
  queue: Record<string, number>;
  workload: { id: string; fullName: string; accountStatus: string; stock: number; support: number; maintenance: number }[];
}

export interface ManagerPeriodReport {
  received: number;
  rent: number;
  deposit: number;
  debt: number;
  overdue: number;
  invoiceCount: number;
  paymentCount: number;
  bookingCount: number;
  confirmedCount: number;
  allocatedUnits: number;
  voidCount: number;
  categories: {
    id: string;
    name: string;
    requests: number;
    confirmed: number;
    units: number;
    rent: number;
    physicalUnits: number;
    occupied: number;
  }[];
  times: { date: string; received: number }[];
}
