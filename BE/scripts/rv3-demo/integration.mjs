// Entirely isolated PostgreSQL cluster; never reads/writes the application's .env database.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../dist/generated/prisma/client.js';
import { AuthService } from '../../dist/modules/auth/auth.service.js';
import { PrismaUserRepository } from '../../dist/modules/users/user.repository.js';
import { StockMovementsService } from '../../dist/modules/stock-movements/stock-movements.service.js';
import { ReportingService } from '../../dist/modules/manager/reporting.service.js';
import { ManagerService } from '../../dist/modules/manager/manager.service.js';
import { accounts, catalogCodes, fingerprint, hash } from './safety.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const bin = process.env.RV3_PG_BIN || (process.platform === 'win32' ? 'D:\\PostgreSQL\\bin' : '');
const binary = name => bin ? path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')) : name;
const directory = await mkdtemp(path.join(tmpdir(), 'nestbox-rv3-isolated-'));
const password = randomBytes(24).toString('base64url'), userPassword = randomBytes(24).toString('base64url'), pwfile = path.join(directory, 'cluster-password');
await writeFile(pwfile, password, { mode: 0o600, flag: 'wx' });
const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve));
const databaseUrl = name => `postgresql://rv3_test:${password}@127.0.0.1:${port}/${name}`;
const source = databaseUrl('nestbox_rv3_demo_source'), target = databaseUrl('nestbox_rv3_demo_test'), restored = databaseUrl('nestbox_rv3_demo_restore');
const env = { ...process.env, DATABASE_URL: source, DIRECT_URL: source, RV3_DEMO_DATABASE_URL: target, RV3_DEMO_DATABASE_FINGERPRINT: fingerprint(target), RV3_DEMO_MODE: 'ISOLATED_DEMO', RV3_PG_BIN: bin, RV3_DEMO_BACKUP_KEY: randomBytes(32).toString('base64'), NODE_ENV: 'test' };
async function run(file, argv, childEnv = env, expected = 0) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, argv, { cwd: root, env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', () => reject(new Error('Unable to start isolated test utility.')));
    child.on('close', code => code === expected ? resolve(output) : reject(new Error(`Isolated step failed: ${path.basename(file)} ${argv[0]} (exit ${code}). ${output.replaceAll(password, '[REDACTED]').slice(-2400)}`)));
  });
}
const cli = (command, extra = [], expected = 0, childEnv = env) => run(process.execPath, ['scripts/rv3-demo.mjs', command, ...extra], childEnv, expected);
let started = false, db, postgres;
try {
  await run(binary('initdb'), ['-D', path.join(directory, 'data'), '-U', 'rv3_test', '--pwfile', pwfile, '--auth=scram-sha-256', '--encoding=UTF8', '--no-locale']);
  postgres = spawn(binary('postgres'), ['-D', path.join(directory, 'data'), '-h', '127.0.0.1', '-p', String(port), '-F'], { windowsHide: true, stdio: 'ignore' });
  postgres.on('error', () => {});
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const probe = new pg.Client({ connectionString: databaseUrl('postgres'), connectionTimeoutMillis: 1000 });
    try { await probe.connect(); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 250)); } finally { await probe.end().catch(() => {}); }
  }
  if (!ready) throw new Error('Temporary PostgreSQL could not start.');
  started = true;
  const admin = new pg.Client({ connectionString: databaseUrl('postgres') }); await admin.connect();
  try { for (const name of ['nestbox_rv3_demo_source', 'nestbox_rv3_demo_test', 'nestbox_rv3_demo_restore']) await admin.query(`CREATE DATABASE "${name}"`); } finally { await admin.end(); }
  for (const url of [source, target]) {
    const result = await run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { ...env, DATABASE_URL: url, DIRECT_URL: url });
    assert(result.includes('All migrations have been successfully applied') || result.includes('No pending migrations'));
  }
  console.log('PASS: current migrations applied only to two new databases in a temporary cluster.');
  const fixtureSource = new PrismaClient({ adapter: new PrismaPg({ connectionString: source }) });
  try {
    const auth = new AuthService(new PrismaUserRepository(fixtureSource));
    const credential = await auth.encodePassword(userPassword);
    for (const [role, email] of Object.entries(accounts)) await fixtureSource.user.create({ data: { id: `isolated-${role.toLowerCase()}`, email, role, fullName: `RV3 Test ${role}`, phone: '0901000001', passwordHash: credential } });
    await fixtureSource.facility.create({ data: { id: 'isolated-facility', code: 'ISOLATED-TEST', name: 'Isolated test facility', address: 'Test only' } });
    // Test-input catalog, not fallback prices in the seed. Bootstrap copies source
    // values exactly; rates below match the inspected canonical catalog snapshot.
    for (const [index, code] of catalogCodes.entries()) await fixtureSource.storageType.create({ data: { id: code.toLowerCase(), facilityId: 'isolated-facility', code, name: ['Tủ RV3', 'Kho nhỏ RV3', 'Kho vừa RV3', 'Kho lớn RV3'][index], sizeId: ['locker', 'small', 'medium', 'large'][index], sizeName: code, kicker: 'Test', condition: 'STANDARD', widthCm: 100 + index * 100, lengthCm: 200 + index * 100, heightCm: 240, roomEquivalent: 'Test', capacity: 'Test', boxCount: 'Test', suitableItems: [], image: '/images/test.png', imageAlt: 'Test', floor: 'Tầng trệt', access: 'Test', features: [], monthlyRate: [650000, 1500000, 2900000, 5500000][index], depositMonths: 1, allowDailyRental: index < 2, minRentalDays: index === 0 ? 1 : index === 1 ? 7 : null } });
  } finally { await fixtureSource.$disconnect(); }
  await cli('bootstrap');
  await cli('bootstrap', ['--apply', `--confirm=${fingerprint(target)}`]);
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target }) });
  const before = hash(await db.user.findMany({ orderBy: { email: 'asc' } }));
  await cli('seed'); assert.equal(await db.reservation.count(), 0);
  await cli('seed', ['--apply', '--confirm=wrong'], 1); assert.equal(await db.reservation.count(), 0);
  const first = await cli('seed', ['--apply', `--confirm=${fingerprint(target)}`]); assert(first.includes('PASS'));
  const invoiceCount = await db.invoice.count(), paymentCount = await db.payment.count();
  await cli('seed', ['--apply', `--confirm=${fingerprint(target)}`]);
  assert.equal(await db.reservation.count(), 5); assert.equal(await db.invoice.count(), invoiceCount); assert.equal(await db.payment.count(), paymentCount);
  assert.equal(hash(await db.user.findMany({ orderBy: { email: 'asc' } })), before);
  assert.equal((await db.storedItem.findFirstOrThrow()).balance, 8);
  assert.equal(await db.onlinePaymentTransaction.count(), 0);
  const auth = new AuthService(new PrismaUserRepository(db));
  const loggedIn = {};
  for (const [role, email] of Object.entries(accounts)) { const session = await auth.login({ email, password: userPassword }); assert.equal(session.user.role, role); assert.equal((await auth.getUserByToken(session.token)).email, email); loggedIn[role] = session.user; }
  const stock = new StockMovementsService(db);
  assert.equal((await stock.listCustomer(loggedIn.CUSTOMER.id, { page: 1, limit: 10 })).total, 3);
  assert.equal((await stock.listStaff(loggedIn.STAFF, { page: 1, limit: 10 })).total, 3);
  assert.equal((await stock.listStoredItems(loggedIn.CUSTOMER.id))[0].balance, 8);
  const dashboard = await new ManagerService(db).dashboardSummary();
  assert.equal(dashboard.pendingReservations, 1); assert.equal(dashboard.activeRentals, 2); assert.equal(dashboard.availableUnits, 7); assert.equal(dashboard.occupiedUnits, 2); assert.equal(dashboard.maintenanceUnits, 1);
  const report = await new ReportingService(db).summary({});
  assert.equal(report.bookingCount, 5); assert.equal(report.invoiceCount, invoiceCount); assert.equal(report.paymentCount, paymentCount); assert.equal(report.confirmedCount, 4);
  assert.equal(report.received, Number((await db.payment.aggregate({ _sum: { amount: true } }))._sum.amount));
  assert.equal((await new PrismaUserRepository(db).list(0, 10)).length, 4);
  console.log('PASS: dry-run, guard, idempotent seed, all four isolated-role logins/sessions, preserved credentials, invoices/payments, allocation, handover, stock.');
  const backupResult = await cli('backup', ['--apply', `--confirm=${fingerprint(target)}`]);
  const backup = JSON.parse(backupResult.trim()).backup;
  await cli('restore', ['--apply', `--confirm=${fingerprint(restored)}`, `--backup=${backup}`], 0, { ...env, RV3_DEMO_DATABASE_URL: restored, RV3_DEMO_DATABASE_FINGERPRINT: fingerprint(restored) });
  const restoredDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: restored }) });
  try { assert.equal(await restoredDb.reservation.count(), 5); assert.equal(await restoredDb.payment.count(), paymentCount); assert.equal(hash(await restoredDb.user.findMany({ orderBy: { email: 'asc' } })), before); } finally { await restoredDb.$disconnect(); }
  let plan = JSON.parse(await cli('cleanup'));
  const protectedPayment = await db.payment.findFirstOrThrow();
  await db.payment.update({ where: { id: protectedPayment.id }, data: { reference: 'UNRECOGNIZED-PAYMENT' } });
  await cli('cleanup', [], 1); // Even a manifest-owned payment needs the exact fixture marker.
  await db.payment.update({ where: { id: protectedPayment.id }, data: { reference: protectedPayment.reference } });
  await cli('cleanup', ['--apply', `--confirm=${fingerprint(target)}`, '--plan=stale'], 1);
  plan = JSON.parse(await cli('cleanup'));
  await cli('cleanup', ['--apply', `--confirm=${fingerprint(target)}`, `--plan=${plan.planHash}`]);
  assert.equal(await db.reservation.count(), 0); assert.equal(await db.storageType.count(), 4); assert.equal(await db.user.count(), 4);
  assert.equal(hash(await db.user.findMany({ orderBy: { email: 'asc' } })), before);
  await cli('seed', ['--apply', `--confirm=${fingerprint(target)}`]);
  // An unknown record is protected even in this disposable database.
  await db.storageUnit.create({ data: { storageTypeId: catalogCodes[0].toLowerCase(), unitNumber: 'UNKNOWN-PROTECTED', floor: 'Tầng trệt', zone: 'UNKNOWN', row: 99, position: 99 } });
  await cli('cleanup', [], 1);
  console.log('PASS: encrypted backup/actual restore, scoped cleanup, credentials/catalog retained, reseed, unknown-record protection.');
} catch (error) {
  console.error(error?.name === 'Error' ? error.message.replaceAll(password, '[REDACTED]').replaceAll(userPassword, '[REDACTED]') : `Isolated test failed (${error?.name || 'unknown'}); sensitive database parameters suppressed.`);
  process.exitCode = 1;
} finally {
  if (db) await db.$disconnect();
  if (started) await run(binary('pg_ctl'), ['-D', path.join(directory, 'data'), '-m', 'fast', '-w', 'stop']).catch(() => postgres?.kill());
  else postgres?.kill();
  // No recursive deletion. Cluster is stopped; artifacts remain local for review.
  console.log('Isolated PostgreSQL stopped. No shared database was touched.');
}
