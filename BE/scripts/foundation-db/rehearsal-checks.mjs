import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const tools = ['pg_dump', 'pg_restore', 'initdb', 'pg_ctl', 'createdb', 'postgres'];
export function postgresTools(serverVersion, env = process.env, probe = versionOf) {
  const expectedMajor = Math.floor(Number(serverVersion) / 10000);
  if (!Number.isInteger(expectedMajor) || expectedMajor < 10) throw Error('Invalid PostgreSQL server version.');
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const candidates = env.PG_BIN_DIR ? [env.PG_BIN_DIR] : [
    ...(env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean),
    path.join(env.ProgramFiles || 'C:/Program Files', 'PostgreSQL', String(expectedMajor), 'bin'),
    path.join('/usr/lib/postgresql', String(expectedMajor), 'bin'),
  ];
  for (const directory of new Set(candidates)) {
    const binaries = Object.fromEntries(tools.map(name => [name, path.resolve(directory, name + suffix)]));
    const versions = Object.fromEntries(tools.map(name => [name, probe(binaries[name])]));
    if (tools.every(name => Number(versions[name]?.split('.')[0]) === expectedMajor)) return { binaries, versions, expectedMajor };
  }
  throw Error(`PostgreSQL ${expectedMajor} tooling required: ${tools.join(', ')} from one distribution. Set PG_BIN_DIR to its bin directory.`);
}

function versionOf(binary) {
  if (!fs.existsSync(binary)) return null;
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  return result.status === 0 ? result.stdout.match(/PostgreSQL\)\s+(\d+(?:\.\d+)*)/)?.[1] : null;
}

export function archiveHash(archive) {
  return createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
}

export function assertArchive(archive, expected, directory) {
  const relative = path.relative(fs.realpathSync(directory), fs.realpathSync(archive));
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || archiveHash(archive) !== expected)
    throw Error('Backup path/hash verification failed.');
}

export function sameFingerprint(before, after) {
  return Boolean(after && before.count === after.count && before.fingerprint === after.fingerprint);
}

export function releaseManifestVerified(manifest, releaseCommit) {
  return manifest.releaseCommit === releaseCommit && manifest.preliminary === false && !manifest.error
    && manifest.recovery?.restored === true && manifest.recovery?.allTablesIdentical === true
    && manifest.rehearsal?.passed === true && manifest.localClusterStopped === true;
}

export function legacyCatalogRehearsal(pending, recoveredId) {
  return !recoveredId && pending.includes('20261124000200_shared_service_catalog');
}

export async function verifyPayosSchema(db) {
  const { rows: [checks] } = await db.query(`
    SELECT
      ARRAY(SELECT e.enumlabel::text FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
        WHERE t.oid='public."PaymentMethod"'::regtype ORDER BY e.enumsortorder) = ARRAY['BANK_TRANSFER','CASH','VNPAY','PAYOS'] AS methods,
      ARRAY(SELECT e.enumlabel::text FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
        WHERE t.oid='public."PaymentProvider"'::regtype ORDER BY e.enumsortorder) = ARRAY['VNPAY','PAYOS'] AS providers,
      (SELECT count(*) = 13 FROM information_schema.columns c JOIN (VALUES
        ('PayosReceipt','id','text','NO'), ('PayosReceipt','orderCode','bigint','NO'),
        ('PayosReceipt','paymentLinkId','text','NO'), ('PayosReceipt','reference','text','NO'),
        ('PayosReceipt','amount','bigint','NO'), ('PayosReceipt','receivedAt','timestamp without time zone','NO'),
        ('PayosReceipt','transactionId','text','YES'), ('OnlinePaymentTransaction','payosOrderCode','bigint','YES'),
        ('OnlinePaymentTransaction','payosLinkId','text','YES'), ('OnlinePaymentTransaction','checkoutUrl','text','YES'),
        ('OnlinePaymentTransaction','expiresAt','timestamp without time zone','YES'),
        ('OnlinePaymentTransaction','providerCheckedAt','timestamp without time zone','YES'),
        ('OnlinePaymentReconciliation','payosReceiptId','text','YES')
      ) AS expected(table_name,column_name,data_type,is_nullable) USING (table_name,column_name,data_type,is_nullable)
        WHERE c.table_schema='public') AS columns,
      (SELECT count(*) = 5 FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid
        JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=i.indkey[0]
        WHERE n.nspname='public' AND i.indisunique AND i.indisvalid AND i.indnkeyatts=1 AND i.indpred IS NULL
        AND (t.relname,a.attname) IN (('PayosReceipt','id'),('PayosReceipt','reference'),
          ('OnlinePaymentTransaction','payosOrderCode'),('OnlinePaymentTransaction','payosLinkId'),
          ('OnlinePaymentReconciliation','payosReceiptId'))) AS unique_keys,
      (SELECT count(*)=2 FROM pg_constraint c WHERE c.contype='f' AND c.convalidated
        AND ((c.conrelid='public."PayosReceipt"'::regclass AND c.confrelid='public."OnlinePaymentTransaction"'::regclass
          AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY ("transactionId")%')
        OR (c.conrelid='public."OnlinePaymentReconciliation"'::regclass AND c.confrelid='public."PayosReceipt"'::regclass
          AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY ("payosReceiptId")%'))) AS receipt_links,
      EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conname='OnlinePaymentReconciliation_one_source'
        AND c.conrelid='public."OnlinePaymentReconciliation"'::regclass AND c.convalidated
        AND regexp_replace(pg_get_expr(c.conbin,c.conrelid),'[[:space:]()]','','g')
          = 'num_nonnulls"onlinePaymentTransactionId","paymentSubmissionId","payosReceiptId"=1') AS one_source,
      NOT EXISTS(SELECT 1 FROM "PayosReceipt") AS empty_new_ledger`);
  if (!checks || Object.values(checks).some(value => value !== true))
    throw Error('PayOS schema verification failed: ' + Object.keys(checks ?? {}).filter(key => checks[key] !== true).join(', '));
  return checks;
}
