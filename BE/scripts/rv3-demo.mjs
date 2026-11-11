import { config } from 'dotenv';
import pg from 'pg';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { accounts, catalogCodes, protectedTables, assertAccounts, fingerprint, guard, identity, hash, quoteIdentifier as qi, deletionOrder } from './rv3-demo/safety.mjs';

config({ quiet: true });
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), command = args.find(arg => !arg.startsWith('--')) || 'seed';
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = args.includes('--apply');
const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.RV3_DEMO_DATABASE_URL;
const url = command === 'inspect' && !targetUrl ? sourceUrl : targetUrl;
if (!url) { console.error('Configure RV3_DEMO_DATABASE_URL; inspect may use the application DATABASE_URL read-only.'); process.exit(1); }
const target = fingerprint(url), folder = path.join(root, 'artifacts', 'rv3-demo');
const manifestPath = path.join(folder, `${target}.manifest.json`);
const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 15000, statement_timeout: 60000 });
const client = await pool.connect();

async function tables(db) { return (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row => row.tablename); }
async function counts(db) { const result = {}; for (const table of await tables(db)) result[table] = Number((await db.query(`SELECT count(*) FROM public.${qi(table)}`)).rows[0].count); return result; }
async function users(db) { return (await db.query('SELECT * FROM public."User" WHERE email = ANY($1::text[]) ORDER BY email', [Object.values(accounts)])).rows; }
async function operational(db) { const result = {}; for (const table of await tables(db)) if (!protectedTables.has(table)) result[table] = (await db.query(`SELECT * FROM public.${qi(table)} ORDER BY id`)).rows; return result; }
async function privateJson(file, value) { await mkdir(folder, { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' }); }
async function inspect() {
  await client.query('BEGIN READ ONLY');
  try {
    const all = await tables(client), result = { fingerprint: target, targetKind: targetUrl ? 'explicit-demo-target (writes still guarded)' : 'application database / read-only', records: await counts(client) };
    if (all.includes('User')) {
      const protectedUsers = await users(client);
      result.accounts = Object.entries(accounts).map(([role, email]) => {
        const user = protectedUsers.find(item => item.email === email);
        return { email, expectedRole: role, exists: Boolean(user), role: user?.role ?? null, status: user?.accountStatus ?? null, validCredentialFormat: Boolean(user && /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/i.test(user.passwordHash)) };
      });
    }
    if (all.includes('StorageType')) result.prices = (await client.query('SELECT code,name,"monthlyRate","allowDailyRental","minRentalDays" FROM "StorageType" ORDER BY code')).rows.map(type => ({ ...type, validMonthlyPrice: type.monthlyRate !== null && Number(type.monthlyRate) > 0 }));
    result.cleanupPolicy = 'No shared cleanup. Isolated cleanup only removes exact manifest-owned records after encrypted backup and plan confirmation. User, sessions, audit, policies and catalog remain.';
    console.log(JSON.stringify(result, null, 2));
  } finally { await client.query('ROLLBACK'); }
}
async function insertRows(db, table, records) {
  for (const record of records) {
    const columns = Object.keys(record);
    const types = (await db.query('SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1', [table])).rows;
    const values = columns.map(key => ['json', 'jsonb'].includes(types.find(type => type.column_name === key)?.data_type) && record[key] !== null ? JSON.stringify(record[key]) : record[key]);
    await db.query(`INSERT INTO ${qi(table)} (${columns.map(qi).join(',')}) VALUES (${columns.map((_, index) => '$' + (index + 1)).join(',')})`, values);
  }
}
async function bootstrap() {
  if (!sourceUrl || fingerprint(sourceUrl) === target) throw new Error('A different read-only source database is required.');
  const source = new pg.Client({ connectionString: sourceUrl, connectionTimeoutMillis: 15000 });
  await source.connect();
  try {
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const preserved = await users(source); assertAccounts(preserved);
    const types = (await source.query('SELECT * FROM "StorageType" WHERE code=ANY($1::text[]) ORDER BY code', [catalogCodes])).rows;
    if (types.length !== 4 || types.some(type => type.monthlyRate === null || Number(type.monthlyRate) <= 0)) throw new Error('Four canonical catalog types must already have positive prices; no fallback prices.');
    const facilities = (await source.query('SELECT * FROM "Facility" WHERE id=ANY($1::text[])', [[...new Set(types.map(type => type.facilityId))]])).rows;
    if (!apply) { console.log(JSON.stringify({ action: 'bootstrap dry-run', create: { User: 4, Facility: facilities.length, StorageType: 4 }, preserved: 'IDs, email, role, status, exact current scrypt hash/salt; no password generated or printed', prices: types.map(type => ({ code: type.code, monthlyRate: type.monthlyRate })) }, null, 2)); return; }
    await client.query('BEGIN');
    try {
      const current = await counts(client);
      if (Object.entries(current).some(([table, count]) => table !== '_prisma_migrations' && count > 0)) throw new Error('Bootstrap requires an empty, migrated demo database. Never overwrite existing accounts/catalog.');
      await insertRows(client, 'User', preserved);
      await insertRows(client, 'Facility', facilities);
      await insertRows(client, 'StorageType', types);
      if (hash(await users(client)) !== hash(preserved)) throw new Error('Credential preservation check failed.');
      await client.query('COMMIT');
      console.log('Copied four existing accounts and four priced catalog types to the isolated database. Source unchanged.');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  } finally { await source.query('ROLLBACK').catch(() => {}); await source.end(); }
}
function binary(name) { return process.env.RV3_PG_BIN ? path.join(process.env.RV3_PG_BIN, name + (process.platform === 'win32' ? '.exe' : '')) : name; }
function pgEnvironment(raw) {
  const parsed = new URL(raw), info = identity(raw);
  return { ...process.env, PGHOST: info.host, PGPORT: info.port, PGDATABASE: info.database, PGUSER: info.user, PGPASSWORD: decodeURIComponent(parsed.password), PGSSLMODE: parsed.searchParams.get('sslmode') || 'prefer' };
}
async function run(name, argv, raw = url) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary(name), argv, { env: pgEnvironment(raw), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    // Deliberately do not print database utility stderr: it may contain identifiers/credentials.
    child.stderr.resume(); child.on('error', () => reject(new Error(`Could not execute ${name}; configure RV3_PG_BIN.`)));
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${name} failed (${code}); stopped without cleanup.`)));
  });
}
function backupKey() { const key = Buffer.from(process.env.RV3_DEMO_BACKUP_KEY || '', 'base64'); if (key.length !== 32) throw new Error('RV3_DEMO_BACKUP_KEY must contain 32 random bytes in base64, stored outside source control.'); return key; }
async function backup() {
  const key = backupKey(); await mkdir(folder, { recursive: true });
  const raw = path.join(folder, `${target}-${randomBytes(8).toString('hex')}.dump.tmp`);
  const output = path.join(folder, `${target}-${Date.now()}.rv3backup`);
  try {
    await run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', raw]);
    await run('pg_restore', ['--list', raw]);
    const dump = await readFile(raw), nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce);
    const metadata = { version: 1, fingerprint: target, createdAt: new Date().toISOString(), dumpHash: hash(dump.toString('base64')), format: 'pg_dump custom / AES-256-GCM' };
    const header = Buffer.from(JSON.stringify(metadata)); cipher.setAAD(header);
    const encrypted = Buffer.concat([cipher.update(dump), cipher.final()]);
    await writeFile(output, JSON.stringify({ metadata, nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: encrypted.toString('base64') }), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ backup: output, ...metadata })); return output;
  } finally { await unlink(raw).catch(() => {}); }
}
async function restore() {
  if (!option('backup')) throw new Error('Provide --backup=<encrypted archive>.');
  if (!apply) { console.log('Restore dry-run: decrypt and restore only into an empty isolated database; no --clean, no drop, no overwrites.'); return; }
  if ((await tables(client)).length) throw new Error('Restore target must have no public tables, including migrations.');
  const archive = JSON.parse(await readFile(option('backup'), 'utf8'));
  const decipher = createDecipheriv('aes-256-gcm', backupKey(), Buffer.from(archive.nonce, 'base64'));
  decipher.setAAD(Buffer.from(JSON.stringify(archive.metadata))); decipher.setAuthTag(Buffer.from(archive.tag, 'base64'));
  const dump = Buffer.concat([decipher.update(Buffer.from(archive.ciphertext, 'base64')), decipher.final()]);
  if (archive.metadata.version !== 1 || hash(dump.toString('base64')) !== archive.metadata.dumpHash) throw new Error('Archive verification failed.');
  await mkdir(folder, { recursive: true }); const raw = path.join(folder, `restore-${randomBytes(8).toString('hex')}.dump.tmp`);
  try { await writeFile(raw, dump, { mode: 0o600, flag: 'wx' }); await run('pg_restore', ['--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges', '--dbname', identity(url).database, raw]); console.log('Restored verified archive into empty isolated database.'); }
  finally { await unlink(raw).catch(() => {}); }
}
async function cleanup() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.fingerprint !== target) throw new Error('Manifest belongs to another database.');
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    const operationalTables = (await tables(client)).filter(table => !protectedTables.has(table));
    await client.query(`LOCK TABLE ${operationalTables.map(qi).join(',')} IN ACCESS EXCLUSIVE MODE`);
    const records = await operational(client);
    for (const [table, rows] of Object.entries(records)) {
      const allowed = new Set(manifest.ids[table] || []);
      if (rows.some(row => !allowed.has(row.id))) throw new Error(`Unowned records in ${table}; cleanup refused, even if apparently demo.`);
    }
    if (records.OnlinePaymentTransaction?.length || records.OnlinePaymentReconciliation?.length) throw new Error('Online transactions/reconciliation are never removable fixtures.');
    if (records.Payment?.some(row => row.method !== 'CASH' || row.onlinePaymentTransactionId || !row.reference?.startsWith('RV3-FIXTURE-') || !row.note?.includes('RV3 DEMO'))) throw new Error('Unrecognized financial records; cleanup refused.');
    if (records.PaymentSubmission?.some(row => !row.customerNote?.includes('DEMO') || !row.transferReference?.startsWith('WDP-DEMO-'))) throw new Error('Non-demo payment submissions are protected.');
    const edges = (await client.query(`SELECT child.relname AS child,parent.relname AS parent FROM pg_constraint fk JOIN pg_class child ON child.oid=fk.conrelid JOIN pg_class parent ON parent.oid=fk.confrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace WHERE fk.contype='f' AND ns.nspname='public'`)).rows;
    // A retained table must never cascade into/delete around demo records without review.
    if (edges.some(edge => protectedTables.has(edge.child) && operationalTables.includes(edge.parent))) throw new Error('Retained-table dependency needs manual review.');
    const order = deletionOrder(operationalTables, edges), snapshot = hash(records);
    console.log(JSON.stringify({ action: 'cleanup plan', fingerprint: target, planHash: snapshot, delete: Object.fromEntries(order.map(table => [table, records[table].length])), preserve: [...protectedTables] }, null, 2));
    if (!apply) { await client.query('ROLLBACK'); return; }
    if (option('plan') !== snapshot) throw new Error('Run dry-run and provide its exact --plan hash.');
    // pg_dump uses another connection; release exclusive locks before backup, then recheck under lock.
    await client.query('ROLLBACK');
    await backup();
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query(`LOCK TABLE ${operationalTables.map(qi).join(',')} IN ACCESS EXCLUSIVE MODE`);
    if (hash(await operational(client)) !== snapshot) throw new Error('Data changed since backup/plan; rerun dry-run.');
    const before = hash(await users(client));
    for (const table of order) await client.query(`DELETE FROM ${qi(table)} WHERE id=ANY($1::text[])`, [records[table].map(row => row.id)]);
    if (hash(await users(client)) !== before) throw new Error('Protected accounts changed.');
    await client.query('COMMIT'); await unlink(manifestPath);
    console.log('Removed only manifest-owned isolated fixtures. Accounts, catalog, audit and configuration retained.');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
}
try {
  if (apply) {
    guard(targetUrl, process.env, option('confirm'));
    if ((await client.query('SELECT current_database() AS name')).rows[0].name !== identity(targetUrl).database) throw new Error('Connected database does not match the inspected URL.');
  }
  if (command === 'inspect') await inspect();
  else if (command === 'bootstrap') await bootstrap();
  else if (command === 'backup') { if (apply) await backup(); else console.log('Backup dry-run: --apply creates encrypted custom-format archive of the isolated target only.'); }
  else if (command === 'restore') await restore();
  else if (command === 'cleanup') await cleanup();
  else if (command === 'seed' || command === 'verify') {
    if (!apply && command === 'seed') {
      await client.query('BEGIN READ ONLY');
      try { assertAccounts(await users(client)); console.log(JSON.stringify({ action: 'seed dry-run', fingerprint: target, planned: { StorageUnit: 12, UnitStaffAssignment: 12, Reservation: 5, ReservationUnit: 4, RentalContract: 4, Invoice: 6, Payment: 3, PaymentSubmission: 1, HandoverAppointment: 3, StoredItem: 1, StockMovement: 3, StockMovementLine: 3, RenewalRequest: 1, ReturnRequest: 1, ReturnInspection: 1, SupportRequest: 1, MaintenanceRequest: 1 }, note: 'First-run estimates; existing complete dataset is retained unchanged. No users/passwords/prices updated. Historical paper acceptance is explicitly simulated; no OTP/VNPay forged.' }, null, 2)); } finally { await client.query('ROLLBACK'); }
    } else {
      if (command === 'seed') guard(targetUrl, process.env, option('confirm'));
      process.env.DATABASE_URL = targetUrl;
      const { execute } = await import('./rv3-demo/seed.mjs');
      const { manifestIds, ...result } = await execute(command === 'verify');
      if (command === 'seed' && !result.existing) await privateJson(manifestPath, { fingerprint: target, createdAt: new Date().toISOString(), ids: manifestIds });
      console.log(JSON.stringify(result, null, 2));
    }
  } else throw new Error('Commands: inspect, bootstrap, seed, verify, backup, cleanup, restore.');
} catch (error) {
  // Never print raw database/Prisma errors, SQL parameters, URLs or credential hashes.
  console.error(JSON.stringify({ error: error?.name === 'Error' && !error?.code ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[REDACTED]') : 'Operation failed; database details and parameters suppressed.', errorType: error?.name, code: error?.code, validation: error?.message?.match(/Unknown (?:argument|field) `\w+`|Argument `\w+` is missing|Invalid value for argument `\w+`|Invalid value provided\. Expected [\w, ]+/)?.[0], at: error?.stack?.split('\n').filter(line => line.trim().startsWith('at ') && (line.includes('rv3-demo') || line.includes('dist/'))).slice(-4), command, fingerprint: target }));
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }
