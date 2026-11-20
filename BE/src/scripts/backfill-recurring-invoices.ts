import 'dotenv/config';
import { BillingService } from '../modules/billing/billing.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const result = await new BillingService(prisma).backfillRecurringInvoices();
    console.log(JSON.stringify(result, null, 2));
    if (result.skipped.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
