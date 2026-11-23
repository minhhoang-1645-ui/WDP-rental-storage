import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import { createHash } from 'node:crypto';
const file = process.argv[2];
if (!file)
  throw new Error(
    'Pass the existing Backend env-file path explicitly. This command is read-only.',
  );
const env = dotenv.parse(fs.readFileSync(path.resolve(file)));
const raw = env.DIRECT_URL || env.DATABASE_URL;
const url = new URL(raw || 'https://invalid.test');
if (
  !['postgres:', 'postgresql:'].includes(url.protocol) ||
  !url.hostname.endsWith('.neon.tech') ||
  url.searchParams.has('options')
)
  throw new Error(
    'Expected an explicit Neon target without connection options overrides.',
  );
const client = new pg.Client({
  connectionString: raw,
  options: '-c default_transaction_read_only=on',
  application_name: 'nestbox-foundation-readonly-preflight',
  connectionTimeoutMillis: 10000,
  statement_timeout: 15000,
});
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  if (
    (await client.query('SHOW transaction_read_only')).rows[0]
      .transaction_read_only !== 'on'
  )
    throw new Error('Read-only transaction required.');
  const required = [
    'FacilityAccess',
    'BusinessRule',
    'ReservationUnit',
    'Invoice',
    'Payment',
    'AdditionalService',
    'Facility',
    'StorageType',
  ];
  const existing = (
    await client.query(
      'SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND tablename=ANY($1::text[])',
      [required],
    )
  ).rows.map((r) => r.tablename);
  const missing = required.filter((t) => !existing.includes(t));
  let integrityPassed = true;

  console.log(JSON.stringify({ check: 'schema', missingTables: missing }));
  const migrations = await client.query(
    'SELECT migration_name,checksum,finished_at FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name DESC',
  );
  console.log(
    JSON.stringify({
      check: 'applied-migrations',
      items: migrations.rows.slice(0, 8).map(({ checksum, ...row }) => row),
    }),
  );
  const mismatches = [];
  for (const row of migrations.rows) {
    const file = new URL(
      '../prisma/migrations/' + row.migration_name + '/migration.sql',
      import.meta.url,
    );
    if (!fs.existsSync(file)) {
      mismatches.push({
        migration: row.migration_name,
        issue: 'missing-local-file',
      });
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    const lf = text
      .split(String.fromCharCode(13, 10))
      .join(String.fromCharCode(10));
    const variants = [
      text,
      lf,
      lf.split(String.fromCharCode(10)).join(String.fromCharCode(13, 10)),
    ];
    if (
      !variants.some(
        (value) =>
          createHash('sha256').update(value).digest('hex') === row.checksum,
      )
    )
      mismatches.push({
        migration: row.migration_name,
        issue: 'checksum-mismatch',
      });
  }
  console.log(
    JSON.stringify({ check: 'applied-migration-checksums', mismatches }),
  );
  const columns = (
    await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='User'",
    )
  ).rows.map((r) => r.column_name);
  if (columns.includes('role'))
    console.log(
      JSON.stringify({
        check: 'roles',
        items: (
          await client.query(
            'SELECT role::text AS role,count(*)::text AS count FROM "User" GROUP BY role ORDER BY role',
          )
        ).rows,
      }),
    );
  if (!missing.length) {
    const sql = fs
      .readFileSync(
        new URL(
          '../prisma/preflight/20261123000300_core_foundation_integrity.sql',
          import.meta.url,
        ),
        'utf8',
      )
      .replace(/BEGIN READ ONLY;/, '')
      .replace(/COMMIT;/, '');
    const results = await client.query(sql);
    for (const result of Array.isArray(results) ? results : [results]) {
      if (result.rows?.some(row => Number(row.blocking_count ?? 0) > 0)) integrityPassed = false;
      if (result.rows)
        console.log(JSON.stringify({ check: 'integrity', items: result.rows }));
    }
    const offersExist=(await client.query("SELECT to_regclass('public.\"FacilityServiceOffering\"') IS NOT NULL AS exists")).rows[0].exists;
    const supplyReport=offersExist
      ? (await client.query('SELECT count(*)::int AS catalog_only_services FROM "AdditionalService" s WHERE NOT EXISTS(SELECT 1 FROM "FacilityServiceOffering" o WHERE o."additionalServiceId"=s.id)')).rows[0]
      : {model:'shared catalog migration pending; global inventory does not establish facility supply'};
    console.log(JSON.stringify({check:'service-catalog-supply',informational:true,...supplyReport}));
    console.log(
      JSON.stringify({
        check: 'unreleased-expired-allocations',
        items: (
          await client.query(
            'SELECT r.status::text AS status,count(*)::text AS count FROM "ReservationUnit" u JOIN "Reservation" r ON r.id=u."reservationId" WHERE u."releasedAt" IS NULL AND r.status::text IN (\'EXPIRED\',\'CANCELLED\',\'REJECTED\') GROUP BY r.status',
          )
        ).rows,
      }),
    );
  }
  await client.query('ROLLBACK');
  console.log(
    JSON.stringify({
      readOnly: true,
      productionWrites: 0,
      historyMatches: mismatches.length === 0,
    }),
  );
  if (missing.length || mismatches.length || !integrityPassed) process.exitCode = 2;
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(
    JSON.stringify({ check: 'failed', code: error.code || 'PREFLIGHT_FAILED' }),
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
