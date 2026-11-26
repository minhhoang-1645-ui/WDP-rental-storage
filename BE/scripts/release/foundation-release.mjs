import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { assertRecoveredHistory, requireCutoverApproval, sameDatabase, verifyFailedMigration } from './guards.mjs';
import { recoverableMigration } from '../migration-command-safety.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
dotenv.config({ path: path.join(root, '.env'), quiet: true, override: false });
const args = process.argv.slice(2),
  mode = args[0] ?? 'check',
  option = (name) =>
    args.find((a) => a.startsWith('--' + name + '='))?.slice(name.length + 3);
function reject(message) {
  throw Error(message);
}
async function fingerprints(client, tables) {
  const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
  const results = [];
  for (const table of tables) {
    const sql =
      "SELECT count(*)::text AS count,encode(sha256(convert_to(COALESCE(string_agg(hash,'' ORDER BY hash),''),'UTF8')),'hex') AS fingerprint FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS hash FROM (SELECT " +
      table.columns.map(quote).join(',') +
      ' FROM ' +
      quote(table.schema) +
      '.' +
      quote(table.name) +
      ') t) rows';
    const result = (await client.query(sql)).rows[0];
    results.push({ ...table, ...result });
  }
  return results;
}
async function readonly(callback) {
  const client = new pg.Client({
    connectionString: process.env.DIRECT_URL,
    options: '-c default_transaction_read_only=on',
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    application_name: 'nestbox-cutover-verification',
  });
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    return await callback(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
  }
}
try {
  if (!['check', 'migrate'].includes(mode))
    reject('Use check or migrate. No other database commands are supported.');
  const { inspectFoundationDatabase, releaseContract } =
    await import('../../dist/foundation-schema.js');
  for (const migration of releaseContract.migrations) {
    const text = fs.readFileSync(
      path.join(root, 'prisma/migrations', migration.name, 'migration.sql'),
      'utf8',
    );
    if (
      !migration.checksums.includes(
        crypto.createHash('sha256').update(text).digest('hex'),
      )
    )
      reject('Release migration file differs from contract: ' + migration.name);
  }
  if (!sameDatabase(process.env.DATABASE_URL, process.env.DIRECT_URL))
    reject('DATABASE_URL and DIRECT_URL must identify the same database.');
  const state = await inspectFoundationDatabase(process.env.DIRECT_URL);
  console.log(
    JSON.stringify({
      mode,
      ...state,
      productionWrites: 0,
      knownHistoricalDivergenceRequiresCutoverAcceptance: true,
    }),
  );
  if (mode === 'check') {
    if (!state.ready) process.exitCode = 2;
  } else {
    requireCutoverApproval(args, state);
    const recordPath = option('approval-record');
    if (!recordPath)
      reject('An explicit signed-off cutover approval record is required.');
    const approval = JSON.parse(
      fs.readFileSync(path.resolve(recordPath), 'utf8'),
    );
    const currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    if (
      approval.approved !== true ||
      typeof approval.approvedBy !== 'string' ||
      !approval.approvedBy.trim() ||
      /TODO|replace|example|<|>/i.test(approval.approvedBy) ||
      !Number.isFinite(Date.parse(approval.approvedAt)) ||
      Date.now() - Date.parse(approval.approvedAt) > 2 * 3600000 ||
      Date.parse(approval.approvedAt) > Date.now() + 60000
    )
      reject('A fresh, explicit approval is required.');
    if (
      approval.releaseCommit !== currentCommit ||
      approval.target?.host !== state.target.host ||
      approval.target?.database !== state.target.database ||
      approval.serviceFullyStopped !== true ||
      approval.historicalChecksumExceptionAccepted !== true
    )
      reject(
        'Approval must bind this exact release, target, stopped writers and historical checksum exception.',
      );
    if (
      execFileSync('git', ['status', '--porcelain', '--', 'BE'], {
        cwd: path.dirname(root),
        encoding: 'utf8',
      }).trim()
    )
      reject('Commit all Backend release changes before cutover.');
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(approval.backupManifest), 'utf8'),
    );
    const dump = fs.readFileSync(manifest.archive);
    if (
      crypto.createHash('sha256').update(dump).digest('hex') !==
        manifest.sha256 ||
      manifest.target?.host !== state.target.host ||
      manifest.target?.database !== state.target.database ||
      manifest.format !==
        'PostgreSQL custom full-database archive; no table/schema filters' ||
      manifest.recovery?.restored !== true ||
      manifest.recovery?.allTablesIdentical !== true ||
      manifest.recovery?.tableCount !== manifest.tables?.length ||
      !manifest.tables?.length ||
      !manifest.rehearsal?.passed ||
      !manifest.localClusterStopped
    )
      reject(
        'A full backup with verified recovery and migration rehearsal for this target is required.',
      );
    const recovering = state.failed.length > 0;
    if (recovering && (approval.recoverFailedMigration !== recoverableMigration ||
        manifest.rehearsal.recoveredFailedMigration !== recoverableMigration))
      reject('Recovery requires explicit approval and rehearsal of the same failed migration.');
    let recoveredId;
    const originalHistory = await readonly(async (client) => {
      if (recovering) recoveredId = await verifyFailedMigration(client, state, releaseContract, args);
      const live = (
        await client.query(
          "SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY 1,2",
        )
      ).rows;
      if (
        JSON.stringify(live) !==
        JSON.stringify(
          manifest.tables.map((t) => ({ schema: t.schema, name: t.name })),
        )
      )
        reject('Backup table coverage no longer matches the live database.');
      for (const table of manifest.tables) {
        const columns = (
          await client.query(
            'SELECT a.attname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=$2 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum',
            [table.schema, table.name],
          )
        ).rows.map((r) => r.attname);
        if (JSON.stringify(columns) !== JSON.stringify(table.columns))
          reject(
            'Database columns changed after backup; a fresh full backup is required.',
          );
      }
      const prints = await fingerprints(client, manifest.tables);
      if (
        prints.some(
          (p, i) =>
            p.count !== manifest.tables[i].count ||
            p.fingerprint !== manifest.tables[i].fingerprint,
        )
      )
        reject(
          'Database changed after backup; take and rehearse a fresh full backup before cutover.',
        );
      const checks = fs
        .readFileSync(
          path.join(
            root,
            'prisma/preflight/20261123000300_core_foundation_integrity.sql',
          ),
          'utf8',
        )
        .replace('BEGIN READ ONLY;', '')
        .replace('COMMIT;', '');
      const query = await client.query(checks);
      if (
        (Array.isArray(query) ? query : [query]).some((q) =>
          q.rows?.some((r) => Number(r.blocking_count ?? 0) > 0),
        )
      )
        reject('Migration preflight found data conflicts.');
      return (
        await client.query('SELECT * FROM "_prisma_migrations" ORDER BY id')
      ).rows;
    });
    const directory = path.join(
      root,
      'artifacts',
      'production-cutover-' + new Date().toISOString().replaceAll(/[:.]/g, '-'),
    );
    fs.mkdirSync(directory, { recursive: true });
    if (process.platform === 'win32') {
      const sid = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], {
        encoding: 'utf8',
        windowsHide: true,
      }).match(/S-1-[0-9-]+/)[0];
      execFileSync(
        'icacls',
        [
          directory,
          '/inheritance:r',
          '/grant:r',
          '*' + sid + ':(OI)(CI)F',
          '*S-1-5-18:(OI)(CI)F',
        ],
        { windowsHide: true, stdio: 'ignore' },
      );
    } else fs.chmodSync(directory, 0o700);
    fs.writeFileSync(
      path.join(directory, 'approval.json'),
      JSON.stringify(approval, null, 2),
      { mode: 0o600 },
    );
    fs.writeFileSync(
      path.join(directory, 'history-before.json'),
      JSON.stringify(originalHistory, null, 2),
      { mode: 0o600 },
    );
    const env = {
      ...process.env,
      PGOPTIONS: '-c lock_timeout=10000 -c statement_timeout=120000',
    };
    if (recoveredId) {
      const resolution = spawnSync(process.execPath,
        ['node_modules/prisma/build/index.js', 'migrate', 'resolve', '--rolled-back', recoverableMigration],
        { cwd: root, env: { ...env, NESTBOX_RELEASE_RESOLVE_FAILED: recoverableMigration },
          windowsHide: true, encoding: 'utf8', timeout: 120000 },
      );
      fs.writeFileSync(path.join(directory, 'prisma-resolve.log'),
        (resolution.stdout ?? '') + (resolution.stderr ?? ''), { mode: 0o600 });
      if (resolution.error || resolution.status !== 0)
        reject('Prisma could not mark the failed attempt rolled back. Keep writers stopped.');
    }
    const result = spawnSync(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      {
        cwd: root,
        env,
        windowsHide: true,
        encoding: 'utf8',
        timeout: 600000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    fs.writeFileSync(
      path.join(directory, 'prisma.log'),
      (result.stdout ?? '') + (result.stderr ?? ''),
      { mode: 0o600 },
    );
    if (result.error || result.status !== 0)
      reject(
        'Migration stopped. Keep all writers stopped and inspect the private cutover log; do not reset or rewrite failed history.',
      );
    const final = await inspectFoundationDatabase(process.env.DIRECT_URL);
    if (!final.ready)
      reject('Final schema verification failed. Keep writers stopped.');
    await readonly(async (client) => {
      const history = (
        await client.query(
          'SELECT * FROM "_prisma_migrations" WHERE id=ANY($1::text[]) ORDER BY id',
          [originalHistory.map((r) => r.id)],
        )
      ).rows;
      assertRecoveredHistory(originalHistory, history, recoveredId);
      const tables = manifest.tables.filter(
        (t) => t.name !== '_prisma_migrations',
      );
      const prints = await fingerprints(client, tables);
      if (
        prints.some(
          (p, i) =>
            p.count !== tables[i].count ||
            p.fingerprint !== tables[i].fingerprint,
        )
      )
        reject('Historical business records changed; keep writers stopped.');
    });
    fs.writeFileSync(
      path.join(directory, 'verified.json'),
      JSON.stringify(
        {
          releaseCommit: currentCommit,
          completedAt: new Date().toISOString(),
          ...final,
          originalBusinessRecordsPreserved: true,
          originalMigrationRowsPreserved: true,
          recoveredFailedAttemptId: recoveredId ?? null,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        migrationsCompleted: true,
        renderDeployed: false,
        evidenceDirectory: directory,
        next: 'Manually deploy the exact approved five-role release; reopen writes only after scoped acceptance checks.',
      }),
    );
  }
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'blocked',
      message:
        error instanceof Error &&
        !/password|postgres(?:ql)?:\/\//i.test(error.message)
          ? error.message
          : 'Release operation stopped; credentials redacted.',
    }),
  );
  process.exitCode = 1;
}
