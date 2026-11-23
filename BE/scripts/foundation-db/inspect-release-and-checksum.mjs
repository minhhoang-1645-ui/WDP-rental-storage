import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseEnv } from 'node:util';
import { readClient, root, fail } from './common.mjs';
const values = parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8'));
const credentialNames = [
  'RENDER_API_KEY',
  'RENDER_API_TOKEN',
  'RENDER_SERVICE_ID',
];
const availableCredentialNames = credentialNames.filter((k) =>
  Boolean(process.env[k] || values[k]),
);
const report = {
  checkedAt: new Date().toISOString(),
  availableCredentialNames,
  renderCommit: {
    verified: false,
    reason: 'No authenticated Render deployment metadata available.',
  },
  renderDatabase: {
    verified: false,
    reason:
      'Public health/OpenAPI cannot establish DATABASE_URL; Render environment access is required.',
  },
};
const { client, connection } = await readClient();
try {
  report.localNeonTarget = connection.identity;
  const name = '20261118000100_notification_receipts';
  const entry = (
    await client.query(
      'SELECT checksum FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL',
      [name],
    )
  ).rows[0];
  const actual = crypto
    .createHash('sha256')
    .update(
      fs.readFileSync(
        path.join(root, 'prisma/migrations', name, 'migration.sql'),
      ),
    )
    .digest('hex');
  const columns = (
    await client.query(
      `SELECT column_name,data_type,datetime_precision,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='NotificationReceipt' ORDER BY ordinal_position`,
    )
  ).rows;
  const constraints = (
    await client.query(
      `SELECT contype,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='"NotificationReceipt"'::regclass AND contype<>'n' ORDER BY contype`,
    )
  ).rows;
  const schemaMatchesRepository =
    columns.length === 3 &&
    columns.every((c) => c.is_nullable === 'NO') &&
    columns[0].column_name === 'userId' &&
    columns[0].data_type === 'text' &&
    columns[1].column_name === 'token' &&
    columns[1].data_type === 'text' &&
    columns[2].column_name === 'readAt' &&
    columns[2].data_type === 'timestamp without time zone' &&
    columns[2].datetime_precision === 3 &&
    columns[2].column_default === 'CURRENT_TIMESTAMP' &&
    constraints.length === 2 &&
    constraints.some(
      (c) =>
        c.contype === 'p' && c.definition === 'PRIMARY KEY ("userId", token)',
    ) &&
    constraints.some(
      (c) =>
        c.contype === 'f' &&
        c.definition ===
          'FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE',
    );
  report.checksum = {
    migration: name,
    applied: entry.checksum,
    repository: actual,
    matches: entry.checksum === actual,
    schemaMatchesRepository,
    columns,
    constraints,
    historyMutated: false,
  };
  report.accounts = (
    await client.query('SELECT id FROM "User" ORDER BY id')
  ).rows;
  report.counts = {};
  for (const table of [
    'User',
    'Reservation',
    'RentalContract',
    'Invoice',
    'Payment',
    'AuditEvent',
  ])
    report.counts[table] = (
      await client.query('SELECT count(*)::int AS count FROM "' + table + '"')
    ).rows[0].count;
  await client.query('ROLLBACK');
  try {
    const response = await fetch(
      'https://wdp-rental-storage.onrender.com/api/docs-json',
      { signal: AbortSignal.timeout(25000) },
    );
    if (response.ok) {
      const doc = await response.json(),
        paths = Object.keys(doc.paths ?? {}),
        text = JSON.stringify(doc),
        roleCodes = [
          'CUSTOMER',
          'STAFF',
          'MANAGER',
          'ADMIN',
          'STORAGE_CUSTOMER',
          'FACILITY_STAFF',
          'FACILITY_MANAGER',
          'BUSINESS_OPERATIONS_MANAGER',
          'SYSTEM_ADMINISTRATOR',
        ];
      report.deployedApi = {
        status: response.status,
        pathCount: paths.length,
        roleCodes: roleCodes.filter((code) => text.includes('"' + code + '"')),
        hasOperations: paths.some((p) => p.includes('/operations/')),
        hasLegacyUnitStaff: paths.some((p) => p.includes('staff-assignment')),
      };
    } else report.deployedApi = { status: response.status };
  } catch (e) {
    report.deployedApi = {
      error: e.name,
      reason:
        'Public probe unavailable; authenticated identity remains unverified.',
    };
  }
  fs.writeFileSync(
    path.join(root, 'artifacts/foundation-release-checksum-verification.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      ...report,
      accounts: report.accounts.length,
      checksum: {
        ...report.checksum,
        columns: undefined,
        constraints: undefined,
      },
    }),
  );
} catch (e) {
  fail(e);
} finally {
  await client.end();
}
