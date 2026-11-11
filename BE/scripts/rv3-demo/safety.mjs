import { createHash } from 'node:crypto';

export const accounts = Object.freeze({ CUSTOMER: 'customer@wdp.test', STAFF: 'staff@wdp.test', MANAGER: 'manager@wdp.test', ADMIN: 'admin@wdp.test' });
export const prefix = 'rv3-demo-v1';
export const marker = '[RV3 DEMO - MO PHONG, KHONG CO TIEN THAT]';
export const catalogCodes = ['LK-A01', 'SM-B12', 'MD-D04', 'LG-F02'];
export const protectedTables = new Set(['User', 'AuthSession', 'AccountFlowToken', 'AccountFlowLimit', 'SigningChallenge', 'AuditEvent', 'BusinessPolicy', 'Facility', 'StorageType', 'AdditionalService', 'AdditionalServiceInventory', '_prisma_migrations']);
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const quoteIdentifier = name => '"' + name.replaceAll('"', '""') + '"';
export function identity(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid database URL; value suppressed.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Expected PostgreSQL URL.');
  return { host: url.hostname.toLowerCase(), port: url.port || '5432', database: decodeURIComponent(url.pathname.slice(1)), user: decodeURIComponent(url.username) };
}
export const fingerprint = raw => hash(identity(raw)).slice(0, 16);
const physicalDatabase = raw => {
  const info = identity(raw);
  const host = ['127.0.0.1', 'localhost', '[::1]'].includes(info.host) ? 'loopback' : info.host;
  return `${host}:${info.port}/${info.database}`;
};
export function guard(raw, env, confirmation) {
  if (!raw || env.RV3_DEMO_MODE !== 'ISOLATED_DEMO' || env.NODE_ENV === 'production') throw new Error('Writes require an explicit isolated demo database, never production.');
  const info = identity(raw);
  // Intentionally narrow: this release cannot write to Supabase/shared/remote databases.
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(info.host) || !/^nestbox_rv3_demo_[a-z0-9_]+$/.test(info.database)) throw new Error('Only a local database named nestbox_rv3_demo_* is writable. Shared Supabase is read-only.');
  const parsed = new URL(raw);
  if ([...parsed.searchParams.keys()].some(key => !['sslmode', 'schema'].includes(key)) || parsed.searchParams.has('schema') && parsed.searchParams.get('schema') !== 'public') throw new Error('Ambiguous connection options are not permitted for demo writes.');
  if (env.DATABASE_URL && physicalDatabase(raw) === physicalDatabase(env.DATABASE_URL)) throw new Error('Demo target must differ from the application DATABASE_URL, including aliases and different database users.');
  const target = fingerprint(raw);
  if (env.RV3_DEMO_DATABASE_FINGERPRINT !== target || confirmation !== target) throw new Error('Expected fingerprint and --confirm must both match the inspected demo target.');
  return target;
}
export function assertAccounts(users) {
  if (users.length !== 4) throw new Error('All four protected accounts must exist before proceeding.');
  for (const [role, email] of Object.entries(accounts)) {
    const user = users.find(item => item.email === email);
    if (!user || user.role !== role || user.accountStatus !== 'ACTIVE' || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/i.test(user.passwordHash)) throw new Error('Protected account missing, inactive, wrong role or unsupported credential format; stopped.');
  }
}
export function deletionOrder(tables, edges) {
  const pending = new Set(tables), result = [];
  while (pending.size) {
    const ready = [...pending].filter(table => !edges.some(edge => edge.parent === table && edge.child !== table && pending.has(edge.child)));
    if (!ready.length) throw new Error('Cyclic foreign keys require manual review; cleanup refused.');
    for (const table of ready) { result.push(table); pending.delete(table); }
  }
  return result;
}
