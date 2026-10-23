import 'dotenv/config';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { Prisma } from '../generated/prisma/client.js';
import { BillingService } from '../modules/billing/billing.service.js';
import { PricingService } from '../modules/pricing/pricing.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const scryptAsync = promisify(scrypt);
const confirmation = 'DEVELOPMENT_ONLY';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function email(name: string) {
  const value = required(name).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(value)) throw new Error(`${name} must be an email address.`);
  return value;
}

function password(name: string) {
  const value = required(name);
  if (value.length < 16 || value.length > 128) throw new Error(`${name} must be 16-128 characters.`);
  return value;
}

async function passwordHash(value: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(value, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addUtcMonths(value: Date, months: number) {
  const result = new Date(value);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const daysInMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, daysInMonth));
  return result;
}

async function main() {
  if (process.env.WDP_VNPAY_DEMO_CONFIRM !== confirmation || process.env.NODE_ENV === 'production') {
    throw new Error('This seed is disabled. Set WDP_VNPAY_DEMO_CONFIRM=DEVELOPMENT_ONLY outside production.');
  }

  const managerEmail = email('WDP_VNPAY_DEMO_MANAGER_EMAIL');
  const customerEmail = email('WDP_VNPAY_DEMO_CUSTOMER_EMAIL');
  const managerPassword = password('WDP_VNPAY_DEMO_MANAGER_PASSWORD');
  const customerPassword = password('WDP_VNPAY_DEMO_CUSTOMER_PASSWORD');
  if (managerEmail === customerEmail) throw new Error('Demo account emails must differ.');

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const end = addUtcMonths(start, 3);
  const managerHash = await passwordHash(managerPassword);
  const customerHash = await passwordHash(customerPassword);
  const prisma = new PrismaService();
  const pricing = new PricingService(prisma);
  const billing = new BillingService(prisma);
  await prisma.$connect();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findMany({
        where: { email: { in: [managerEmail, customerEmail] } },
        select: { email: true },
      });
      if (existing.length) throw new Error(`Refusing to alter existing demo account: ${existing.map((user) => user.email).join(', ')}.`);

      const unit = await tx.storageUnit.findFirst({
        where: {
          status: 'AVAILABLE',
          storageType: { catalogStatus: { in: ['AVAILABLE', 'LIMITED'] }, monthlyRate: { not: null } },
          reservationUnits: {
            none: {
              releasedAt: null,
              reservation: { status: 'CONFIRMED', startDate: { lt: end }, endDate: { gt: start } },
            },
          },
        },
        include: { storageType: true },
        orderBy: { unitNumber: 'asc' },
      });
      if (!unit) throw new Error('No available storage unit can support the VNPay demo reservation.');

      const startDate = isoDate(start);
      const endDate = isoDate(end);
      const quote = pricing.calculate(unit.storageType, {
        storageTypeId: unit.storageTypeId,
        quantity: 1,
        startDate,
        endDate,
        paymentPlan: 'PAY_MONTHLY',
      });
      const marker = randomBytes(4).toString('hex').toUpperCase();
      const [manager, customer] = await Promise.all([
        tx.user.create({ data: { email: managerEmail, fullName: 'WDP VNPay Sandbox Manager', phone: '0900000101', role: 'MANAGER', accountStatus: 'ACTIVE', passwordHash: managerHash } }),
        tx.user.create({ data: { email: customerEmail, fullName: 'WDP VNPay Sandbox Customer', phone: '0900000102', role: 'CUSTOMER', accountStatus: 'ACTIVE', passwordHash: customerHash } }),
      ]);
      const reservation = await tx.reservation.create({
        data: {
          reservationCode: `WDP-VNPAY-${marker}`,
          customerId: customer.id,
          facilityId: unit.storageType.facilityId,
          storageTypeId: unit.storageTypeId,
          quantity: 1,
          startDate: start,
          endDate: end,
          periodMode: 'DURATION',
          durationMonths: 3,
          adjacentPreference: false,
          availabilitySnapshot: { available: true, reasonCode: 'AVAILABLE', seededFor: 'VNPAY_SANDBOX' },
          quoteSnapshot: quote as unknown as Prisma.InputJsonValue,
          status: 'CONFIRMED',
          confirmedAt: now,
          notes: 'Development-only VNPay Sandbox test reservation.',
          idempotencyKey: `vnpay-demo-reservation-${marker}`,
        },
      });
      const allocation = await tx.reservationUnit.create({
        data: { reservationId: reservation.id, storageUnitId: unit.id, plannedStartDate: start, plannedEndDate: end },
      });
      await tx.rentalContract.create({
        data: { contractCode: `${reservation.reservationCode}-C01`, reservationId: reservation.id, reservationUnitId: allocation.id, status: 'PENDING_PAYMENT', startDate: start, endDate: end },
      });
      const invoice = await billing.ensureInitialInvoice(tx, reservation.id);
      return { manager, customer, reservation, invoice, unit };
    }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 });

    console.log(JSON.stringify({
      manager: { email: created.manager.email, role: created.manager.role, accountStatus: created.manager.accountStatus },
      customer: { email: created.customer.email, role: created.customer.role, accountStatus: created.customer.accountStatus },
      reservation: { code: created.reservation.reservationCode, status: created.reservation.status, unit: created.unit.unitNumber },
      invoice: { code: created.invoice.invoiceCode, status: created.invoice.status, balanceDue: created.invoice.balanceDue.toString(), currency: created.invoice.currency },
    }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'VNPay demo seed failed.');
  process.exitCode = 1;
});
