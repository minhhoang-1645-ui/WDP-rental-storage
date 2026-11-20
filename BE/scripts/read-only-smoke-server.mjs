// Test helper only: public catalog + real pricing calculation; availability is explicitly a fixture.
// Every catalog/pricing query runs in a read-only transaction. No Nest lifecycle/sweeper, auth, email or payment endpoints run.
import 'dotenv/config';
import { createServer } from 'node:http';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { BookingService } from '../dist/modules/booking/booking.service.js';
import { PricingService } from '../dist/modules/pricing/pricing.service.js';
import { AdditionalServicesService } from '../dist/modules/additional-services/additional-services.service.js';

process.env.DATABASE_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaService();
await prisma.$connect();
// A fresh transaction per request avoids keeping an idle remote database transaction alive.
async function readOnly(run) {
  return prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const mode = await tx.$queryRawUnsafe("SELECT current_setting('transaction_read_only')::text AS readonly");
    if (mode[0]?.readonly !== 'on') throw new Error('Refusing to serve tests without a read-only transaction.');
    return run(tx);
  }, { maxWait: 10000, timeout: 20000 });
}
await readOnly(async () => true);
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  const url = new URL(request.url, 'http://127.0.0.1:3001');
  try {
    if (request.method === 'GET' && url.pathname === '/api/_test/read-only') return response.end(JSON.stringify({ testOnly: true, databaseMode: 'READ_ONLY', availability: 'FIXTURE' }));
    if (request.method === 'GET' && url.pathname === '/api/booking/catalog') return response.end(JSON.stringify(await readOnly(tx => new BookingService(tx).getCatalog())));
    if (request.method === 'GET' && url.pathname === '/api/additional-services') return response.end(JSON.stringify(await readOnly(tx => new AdditionalServicesService(tx).publicCatalog())));
    if (request.method === 'POST' && ['/api/pricing/quote', '/api/booking/availability'].includes(url.pathname)) {
      let payload = ''; for await (const chunk of request) { payload += chunk; if (payload.length > 65536) throw new Error('Oversized test payload.'); }
      const input = JSON.parse(payload);
      if (url.pathname === '/api/pricing/quote') return response.end(JSON.stringify(await readOnly(tx => new PricingService(tx).quote(input))));
      let endDate = input.endDate;
      if (input.periodMode === 'duration') {
        const start = new Date(input.startDate + 'T00:00:00Z'), end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + Number(input.durationMonths), 1));
        end.setUTCDate(Math.min(start.getUTCDate(), new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate())); endDate = end.toISOString().slice(0, 10);
      }
      const quote = await readOnly(tx => new PricingService(tx).quote({ storageTypeId: input.productId, startDate: input.startDate, endDate, quantity: input.quantity, paymentPlan: input.paymentPlan, services: input.services ?? [] }));
      return response.end(JSON.stringify({ available: true, startDate: input.startDate, endDateExclusive: endDate, periodStatus: quote.periodStatus, reasonCode: 'ISOLATED_FIXTURE', message: 'Khả dụng giả lập để kiểm tra giao diện; không giữ kho.', quote }));
    }
    response.statusCode = 405; response.end(JSON.stringify({ message: 'Read-only test helper; endpoint disabled.' }));
  } catch (error) {
    console.error('Read-only helper request failed:', error?.name, error?.code ?? 'NO_CODE');
    response.statusCode = typeof error?.getStatus === 'function' ? error.getStatus() : 500;
    response.end(JSON.stringify(typeof error?.getResponse === 'function' ? error.getResponse() : { message: 'Read-only test request failed.' }));
  }
});
server.listen(3001, '127.0.0.1', () => console.log('READ-ONLY smoke helper http://127.0.0.1:3001/api — catalog/pricing only; availability fixture; mutations disabled.'));
async function stop() { server.close(() => { void prisma.$disconnect(); }); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
