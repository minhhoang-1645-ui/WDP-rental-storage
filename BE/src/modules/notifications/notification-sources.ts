import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { PublicUser } from '../auth/auth.types.js';
import { AppointmentsService } from '../appointments/appointments.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BillingService } from '../billing/billing.service.js';
import { BookingService } from '../booking/booking.service.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { DamageClaimsService } from '../claims/damage-claims.service.js';
import { DepositSettlementsService } from '../deposit-settlements/deposit-settlements.service.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';
import { RenewalsService } from '../renewals/renewals.service.js';
import { ReturnsService } from '../returns/returns.service.js';
import { SupportService } from '../support/support.service.js';
import { TransfersService } from '../transfers/transfers.service.js';
import type { NotificationData, NotificationRow } from './notification-content.js';

type Query = { page: number; limit: number };
type Page = { items: readonly object[]; total: number; limit: number };
type Source = (query: Query) => Promise<Page | readonly object[]>;

async function readSource(source: Source): Promise<NotificationRow[]> {
  const first = await source({ page: 1, limit: 100 });
  if (!('items' in first)) return first.map(row => row as NotificationRow);
  const rows = [...first.items];
  for (let page = 2; page <= Math.ceil(first.total / first.limit); page++) {
    const next = await source({ page, limit: 100 });
    if (!('items' in next)) throw new Error('Invalid notification source page');
    rows.push(...next.items);
  }
  return rows as NotificationRow[];
}

@Injectable()
export class NotificationSources {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
    private readonly booking: BookingService,
    private readonly contracts: ContractsService,
    private readonly claims: DamageClaimsService,
    private readonly deposits: DepositSettlementsService,
    private readonly maintenance: MaintenanceService,
    private readonly renewals: RenewalsService,
    private readonly returns: ReturnsService,
    private readonly support: SupportService,
    private readonly transfers: TransfersService,
  ) {}

  private sources(actor: PublicUser): Record<string, Source> {
    const { id, role } = actor;
    if (role === "BUSINESS_OPERATIONS_MANAGER") return {};
    if (role === 'SYSTEM_ADMINISTRATOR') return { users: q => this.audit.list({ page: String(q.page), limit: String(q.limit), category: 'ACCOUNT_NOTICES' },actor) };
    const common: Record<string, Source> = { 'damage-claims': q => this.claims.list(actor, q) };
    if (role === 'STORAGE_CUSTOMER') return {
      ...common,
      reservations: () => this.booking.listReservations(id),
      'transfer-orders': () => this.transfers.listCustomer(actor),
      invoices: q => this.billing.listCustomerInvoices(id, q.page, q.limit),
      'payment-submissions': q => this.billing.listCustomerPaymentSubmissions(id, q.page, q.limit),
      appointments: q => this.appointments.listCustomerAppointments(id, q),
      renewals: q => this.renewals.listCustomerRenewals(id, q.page, q.limit),
      returns: q => this.returns.listCustomerReturns(id, q),
      'deposit-settlements': q => this.deposits.listCustomer(id, q.page, q.limit),
      'support-requests': q => this.support.listCustomer(id, q),
      contracts: q => this.contracts.listCustomerContracts(id, q),
    };
    const operational = { ...common, appointments: (q: Query) => this.appointments.listOperationalAppointments(q, actor) };
    if (role === 'FACILITY_STAFF') return {
      ...operational,
      returns: q => this.returns.listStaffReturns(q, actor),
      maintenance: q => this.maintenance.listStaff(q, actor),
      'support-requests': q => this.support.listStaff(q, actor),
      transfers: q => this.transfers.listForStaff(q, actor),
    };
    return {
      ...operational,
      'catalog-changes': q => this.audit.catalogNotices(actor, q),
      returns: q => this.returns.listManagerReturns(q,actor),
      maintenance: q => this.maintenance.listManager(q,actor),
      'support-requests': q => this.support.listManager(q,actor),
      transfers: q => this.transfers.list(q,actor),
      renewals: q => this.renewals.listManagerRenewals(q, actor),
      invoices: q => this.billing.listManagerInvoices(q, actor),
      'deposit-settlements': q => this.deposits.listManager(q, actor),
    };
  }

  async load(actor: PublicUser): Promise<NotificationData> {
    const entries = Object.entries(this.sources(actor));
    const result: NotificationData = {};
    // Keep the same bounded database fan-out as the workspace activity reader.
    let index = 0;
    const worker = async () => {
      while (index < entries.length) {
        const [kind, source] = entries[index++];
        result[kind] = await readSource(source);
      }
    };
    try {
      await Promise.all([worker(), worker(), worker()]);
    } catch (error) {
      throw new ServiceUnavailableException('Không thể tải thông báo.', { cause: error });
    }
    return result;
  }
}
