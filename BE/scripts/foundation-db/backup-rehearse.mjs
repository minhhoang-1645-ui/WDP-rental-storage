import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { root, pgBin, readClient, quote, fail } from './common.mjs';
import { assertRecoveredHistory, verifyFailedMigration } from '../release/guards.mjs';
import { recoverableMigration } from '../migration-command-safety.mjs';
const args = process.argv.slice(2);
const manifests = args.filter(arg => arg !== '--recover-single-facility-migration');
if (manifests.length > 1 || manifests.some(arg => arg.startsWith('--')))
  throw Error('Pass an optional private manifest path and --recover-single-facility-migration.');
const directory = path.join(
  root,
  'artifacts',
  'foundation-db-finalize-' + new Date().toISOString().replaceAll(/[:.]/g, '-'),
);
fs.mkdirSync(directory, { recursive: true });
function command(binary, args, env = process.env) {
  const ctl = path.basename(binary) === 'pg_ctl.exe';
  const descriptor = ctl
    ? fs.openSync(path.join(directory, 'pgctl-process.log'), 'a')
    : undefined;
  let result;
  try {
    result = spawnSync(binary, args, {
      cwd: root,
      env,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 180000,
      maxBuffer: 8 * 1024 * 1024,
      ...(ctl ? { stdio: ['ignore', descriptor, descriptor] } : {}),
    });
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  fs.appendFileSync(
    path.join(directory, 'commands.log'),
    path.basename(binary) +
      ' ' +
      args.filter((v) => !v.includes('password')).join(' ') +
      '\n' +
      (result.stdout || '') +
      (result.stderr || '') +
      '\n',
  );
  if (result.error || result.status !== 0) {
    const error = Error('Command failed');
    error.safeMessage =
      path.basename(binary) + ' failed. See private backup logs.';
    throw error;
  }
  return result.stdout;
}
const sid = command('whoami', ['/user', '/fo', 'csv', '/nh']).match(
  /S-1-[0-9-]+/,
)[0];
command('icacls', [
  directory,
  '/inheritance:r',
  '/grant:r',
  '*' + sid + ':(OI)(CI)F',
  '*S-1-5-18:(OI)(CI)F',
]);
const localPort = 55440,
  database = 'nestbox_foundation_restore',
  username = 'nestbox_restore',
  password = crypto.randomBytes(32).toString('base64url');
await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(localPort, '127.0.0.1', () => server.close(resolve));
});
const previousPath = manifests[0] ? path.resolve(manifests[0]) : undefined;
if (
  previousPath &&
  !previousPath.startsWith(path.join(root, 'artifacts') + path.sep)
)
  throw Error('Only a private workspace backup manifest is allowed.');
const previous = previousPath ? JSON.parse(fs.readFileSync(previousPath, 'utf8')) : undefined;
const archive = previous?.archive ?? path.join(directory, 'neon-full.dump'),
  cluster = path.join(directory, 'restore-pgdata'),
  passwordFile = path.join(directory, 'local-test-password.tmp');
const { client, connection } = previous
  ? { client: undefined, connection: undefined }
  : await readClient();
let local,
  started = false;
const manifest = previous
  ? {
      ...previous,
      recovery: {},
      rehearsal: undefined,
      sourceManifest: previousPath,
      recoveryStartedAt: new Date().toISOString(),
    }
  : {
      target: connection.identity,
      createdAt: new Date().toISOString(),
      archive,
      format:
        'PostgreSQL custom full-database archive; no table/schema filters',
      tables: [],
      recovery: {},
    };
const bin = (name) => path.join(pgBin, name + '.exe');
function remoteEnv() {
  const u = connection.url;
  const env = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGSSLMODE: u.searchParams.get('sslmode') || 'require',
    PGOPTIONS: '-c default_transaction_read_only=on',
    PGCONNECT_TIMEOUT: '15',
  };
  for (const key of ['PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE'])
    delete env[key];
  return env;
}
function localEnv() {
  const env = {
    ...process.env,
    PGHOST: '127.0.0.1',
    PGPORT: String(localPort),
    PGDATABASE: database,
    PGUSER: username,
    PGPASSWORD: password,
    PGSSLMODE: 'disable',
    PGOPTIONS: '',
  };
  for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGHOSTADDR', 'PGPASSFILE'])
    delete env[key];
  return env;
}
async function fingerprint(db, table, columns, originalIds) {
  const from = columns
    ? '(SELECT ' +
      columns.map(quote).join(',') +
      ' FROM ' +
      quote(table.schema) +
      '.' +
      quote(table.name) +
      (originalIds ? ' WHERE id=ANY($1::text[])' : '') +
      ')'
    : quote(table.schema) + '.' + quote(table.name);
  return (
    await db.query(
      "SELECT count(*)::text AS count,encode(sha256(convert_to(COALESCE(string_agg(hash,'' ORDER BY hash),''),'UTF8')),'hex') AS fingerprint FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS hash FROM " +
        from +
        ' t) rows',
      originalIds ? [originalIds] : [],
    )
  ).rows[0];
}
async function inventory(db) {
  const tables = (
    await db.query(
      "SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY n.nspname,c.relname",
    )
  ).rows;
  const result = [];
  for (const table of tables) {
    const columns = (
      await db.query(
        'SELECT a.attname AS name FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum',
        [table.schema, table.name],
      )
    ).rows.map((x) => x.name);
    result.push({ ...table, columns, ...(await fingerprint(db, table)) });
  }
  return result;
}
try {
  if (!previous) {
    const snapshot = (
      await client.query('SELECT pg_export_snapshot() AS snapshot')
    ).rows[0].snapshot;
    manifest.tables = await inventory(client);
    manifest.accountIds = (
      await client.query('SELECT id FROM "User" ORDER BY id')
    ).rows.map((x) => x.id);
    manifest.migrations = (
      await client.query(
        'SELECT migration_name,checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
      )
    ).rows;
    command(
      bin('pg_dump'),
      [
        '--format=custom',
        '--no-password',
        '--snapshot=' + snapshot,
        '--lock-wait-timeout=10s',
        '--file=' + archive,
      ],
      remoteEnv(),
    );
    manifest.sha256 = crypto
      .createHash('sha256')
      .update(fs.readFileSync(archive))
      .digest('hex');
    manifest.bytes = fs.statSync(archive).size;
    fs.writeFileSync(
      path.join(directory, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );
    await client.query('ROLLBACK');
    await client.end();
  } else {
    if (
      !path
        .resolve(archive)
        .startsWith(path.join(root, 'artifacts') + path.sep) ||
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(archive))
        .digest('hex') !== previous.sha256
    )
      throw Error('Backup path/hash verification failed.');
  }

  fs.writeFileSync(passwordFile, password, { flag: 'wx', mode: 0o600 });
  command(bin('initdb'), [
    '-D',
    cluster,
    '--auth=scram-sha-256',
    '--pwfile=' + passwordFile,
    '--username=' + username,
    '--encoding=UTF8',
    '--locale=C',
  ]);
  fs.unlinkSync(passwordFile);
  command(bin('pg_ctl'), [
    '-D',
    cluster,
    '-l',
    path.join(directory, 'restore-postgres.log'),
    '-o',
    '-p ' + localPort + ' -h 127.0.0.1',
    '-w',
    'start',
  ]);
  started = true;
  command(
    bin('createdb'),
    [
      '--no-password',
      '--maintenance-db=postgres',
      '--host=127.0.0.1',
      '--port=' + localPort,
      '--username=' + username,
      database,
    ],
    localEnv(),
  );
  command(
    bin('pg_restore'),
    [
      '--exit-on-error',
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--no-password',
      '--host=127.0.0.1',
      '--port=' + localPort,
      '--username=' + username,
      '--dbname=' + database,
      archive,
    ],
    localEnv(),
  );
  local = new pg.Client({
    host: '127.0.0.1',
    port: localPort,
    database,
    user: username,
    password,
    connectionTimeoutMillis: 10000,
  });
  await local.connect();
  await local.query("SET TIME ZONE 'UTC'");
  const restored = await inventory(local),
    problems = [];
  for (const source of manifest.tables) {
    const copy = restored.find(
      (t) => t.schema === source.schema && t.name === source.name,
    );
    if (
      !copy ||
      source.count !== copy.count ||
      source.fingerprint !== copy.fingerprint
    )
      problems.push(source.schema + '.' + source.name);
  }
  if (restored.length !== manifest.tables.length) problems.push('table-count');
  const ids = (await local.query('SELECT id FROM "User" ORDER BY id')).rows.map(
    (x) => x.id,
  );
  if (JSON.stringify(ids) !== JSON.stringify(manifest.accountIds))
    problems.push('account-identities');
  manifest.recovery = {
    restored: true,
    allTablesIdentical: problems.length === 0,
    tableCount: restored.length,
    accounts: ids.length,
    problems,
    ownerPrivileges:
      'Ownership/ACL retained in archive; sandbox restore uses --no-owner --no-privileges only.',
  };
  if (problems.length)
    throw Object.assign(Error('Restoration mismatch'), {
      safeMessage: 'Restored database differs from exported snapshot.',
    });
  console.log(
    JSON.stringify({
      backup: {
        directory,
        archive,
        sha256: manifest.sha256,
        bytes: manifest.bytes,
        tables: manifest.tables.length,
      },
      recovery: manifest.recovery,
    }),
  );
  manifest.originalMigrationIds = (
    await local.query(
      'SELECT id FROM ' + quote('_prisma_migrations') + ' ORDER BY id',
    )
  ).rows.map((r) => r.id);
  manifest.localRehearsalPending = true;
  fs.writeFileSync(
    path.join(directory, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  const localUrl =
    'postgresql://' +
    username +
    ':' +
    password +
    '@127.0.0.1:' +
    localPort +
    '/' +
    database;
  const env = {
    ...localEnv(),
    NESTBOX_RECOVERY_ENABLED: '1',
    NESTBOX_RECOVERY_DATABASE_URL: localUrl,
    DATABASE_URL: localUrl,
    DIRECT_URL: localUrl,
  };
  const { inspectFoundationDatabase, releaseContract } = await import('../../dist/foundation-schema.js');
  const state = await inspectFoundationDatabase(localUrl);
  let recoveredId, historyBefore;
  if (state.failed.length) {
    recoveredId = await verifyFailedMigration(local, state, releaseContract, args);
    historyBefore = (await local.query('SELECT * FROM "_prisma_migrations" ORDER BY id')).rows;
    command(process.execPath, [
      'node_modules/prisma/build/index.js', 'migrate', 'resolve', '--rolled-back', recoverableMigration,
      '--config', 'prisma.recovery.config.ts',
    ], env);
  }
  command(
    process.execPath,
    ['scripts/release/check-recovery-guard.mjs', 'before'],
    env,
  );
  command(
    process.execPath,
    [
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--config',
      'prisma.recovery.config.ts',
    ],
    env,
  );
  command(
    process.execPath,
    ['scripts/release/check-recovery-guard.mjs', 'after'],
    env,
  );
  const after = (
    await local.query(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
    )
  ).rows.map((x) => x.migration_name);
  const historyAfter = (
    await local.query(
      'SELECT migration_name,checksum FROM ' +
        quote('_prisma_migrations') +
        ' WHERE migration_name=ANY($1::text[]) AND finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
      [manifest.migrations.map((m) => m.migration_name)],
    )
  ).rows;
  if (JSON.stringify(historyAfter) !== JSON.stringify(manifest.migrations))
    throw Object.assign(Error('Historical migration checksum changed'), {
      safeMessage: 'Applied migration history must remain unchanged.',
    });
  if (recoveredId) {
    const actual = (await local.query(
      'SELECT * FROM "_prisma_migrations" WHERE id=ANY($1::text[]) ORDER BY id',
      [manifest.originalMigrationIds],
    )).rows;
    assertRecoveredHistory(historyBefore, actual, recoveredId);
  }
  const altered = [];
  for (const table of manifest.tables) {
    if (recoveredId && table.name === '_prisma_migrations') continue;
    const result = await fingerprint(
      local,
      table,
      table.columns,
      table.name === '_prisma_migrations'
        ? manifest.originalMigrationIds
        : undefined,
    );
    if (
      table.count !== result.count ||
      table.fingerprint !== result.fingerprint
    )
      altered.push(table.schema + '.' + table.name);
  }
  if (altered.length)
    throw Object.assign(Error('Migration changed historical data'), {
      safeMessage:
        'Migration rehearsal altered original columns/records: ' +
        altered.join(', '),
    });

  if (recoveredId) {
    const index = (await local.query(`
      SELECT indisunique AND indisvalid AS valid, pg_get_indexdef(indexrelid) AS definition
      FROM pg_index WHERE indexrelid=to_regclass('public."FacilityAccess_one_active_per_user"')
    `)).rows[0];
    if (!index?.valid || !index.definition.endsWith('("userId") WHERE ("revokedAt" IS NULL)'))
      throw Error('Single-facility unique index is missing or invalid.');
  }

  // The TAPE-only baseline belongs to the original shared-catalog migration.
  // For later releases, compare the restored service tables to the production snapshot above.
  const offeringRows = (
    await local.query(
      'SELECT o."additionalServiceId",o."facilityId",o."unitPrice"::text,o."stockOnHand",o."rentalCapacity",s.code FROM "FacilityServiceOffering" o JOIN "AdditionalService" s ON s.id=o."additionalServiceId" ORDER BY s.code',
    )
  ).rows;
  if (!recoveredId && (offeringRows.length !== 1 || offeringRows[0].code !== 'TAPE'))
    throw Error('Unverified legacy offering created');
  const unchanged = (
    await local.query(
      'SELECT o.id FROM "FacilityServiceOffering" o JOIN "AdditionalService" s ON s.id=o."additionalServiceId" LEFT JOIN "AdditionalServiceInventory" i ON i."additionalServiceId"=s.id WHERE o."unitPrice" IS DISTINCT FROM s."unitPrice" OR o."stockOnHand" IS DISTINCT FROM i."stockOnHand" OR o."rentalCapacity" IS DISTINCT FROM i."rentalCapacity"',
    )
  ).rows;
  if (!recoveredId && unchanged.length) throw Error('Legacy price/stock was changed');
  if (!recoveredId) command(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--config',
      'vitest.service-offerings.config.ts',
    ],
    env,
  );
  const serviceOwners = (
    await local.query(
      'SELECT s.code,s.' +
        quote('facilityId') +
        ' AS facility_id,f.code AS facility_code FROM ' +
        quote('AdditionalService') +
        ' s LEFT JOIN ' +
        quote('Facility') +
        ' f ON f.id=s.' +
        quote('facilityId') +
        ' ORDER BY s.code',
    )
  ).rows;
  if (
    !recoveredId && (serviceOwners.some(
      (s) => s.code === 'TAPE' && s.facility_code !== 'NESTBOX-DEMO',
    ) ||
    serviceOwners.some((s) => s.code !== 'TAPE' && s.facility_id !== null))
  )
    throw Error('Unexpected legacy service mapping');
  const links = (
    await local.query(
      'SELECT (SELECT count(*) FROM ' +
        quote('ReservationService') +
        ' rs LEFT JOIN ' +
        quote('AdditionalService') +
        ' s ON s.id=rs.' +
        quote('additionalServiceId') +
        ' WHERE s.id IS NULL)::int AS reservation_orphans,(SELECT count(*) FROM ' +
        quote('GuestBookingService') +
        ' gs LEFT JOIN ' +
        quote('AdditionalService') +
        ' s ON s.id=gs.' +
        quote('additionalServiceId') +
        ' WHERE s.id IS NULL)::int AS guest_orphans',
    )
  ).rows[0];
  if (links.reservation_orphans || links.guest_orphans)
    throw Error('Broken legacy service reference');
  const columns = (
    await local.query(
      "SELECT table_name,column_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND ((table_name='HandoverAppointment' AND column_name='handoverLeadDays') OR (table_name='AuditEvent' AND column_name='metadata') OR (table_name='AdditionalService' AND column_name='facilityId') OR (table_name='OnlinePaymentReconciliation' AND column_name IN ('paymentSubmissionId','externalReferenceKey','onlinePaymentTransactionId'))) ORDER BY 1,2",
    )
  ).rows;
  if (columns.length !== 6 || columns.some((c) => c.is_nullable !== 'YES'))
    throw Error('Final schema columns missing or incompatible');
  const guard = (
    await local.query(
      'SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname=$1',
      ['Invoice_nonnegative_balances'],
    )
  ).rows[0]?.definition;
  if (!guard?.includes('VOID'))
    throw Error('VOID-compatible balance constraint missing');
  manifest.rehearsal = {
    passed: true,
    verifiedOfferings: offeringRows,
    focusedOfferingTestsPassed: recoveredId ? null : true,
    recoveredFailedMigration: recoveredId ? recoverableMigration : null,
    startupSchemaGuardBeforeAndAfterPassed: true,
    historyChecksumsPreserved: true,
    serviceOwners,
    serviceReferences: links,
    verifiedColumns: columns,
    appliedMigrations: after.filter(
      (x) => !manifest.migrations.some((m) => m.migration_name === x),
    ),
    originalRowsAndColumnsPreserved: true,
  };
  delete manifest.localRehearsalPending;
  console.log(JSON.stringify({ rehearsal: manifest.rehearsal }));
} catch (error) {
  const message = error instanceof Error ? error.message : '';
  if (message && !/password|postgres(?:ql)?:\/\//i.test(message) && !error.safeMessage)
    error.safeMessage = message;
  manifest.error = {
    code: error.code || 'REHEARSAL_FAILED',
    message: error.safeMessage || 'See private command log.',
  };
  fail(error);
} finally {
  if (local) await local.end().catch(() => {});
  if (client) await client.end().catch(() => {});
  if (started) {
    try {
      command(bin('pg_ctl'), ['-D', cluster, '-m', 'fast', '-w', 'stop']);
      manifest.localClusterStopped = true;
    } catch (error) {
      manifest.localClusterStopped = false;
      fail(error);
    }
  }
  if (fs.existsSync(passwordFile)) fs.unlinkSync(passwordFile);
  fs.writeFileSync(
    path.join(directory, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  console.log(
    JSON.stringify({
      manifest: path.join(directory, 'manifest.json'),
      productionWrites: 0,
    }),
  );
}
