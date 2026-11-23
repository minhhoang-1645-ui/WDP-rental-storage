import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { root, readClient, fail } from './common.mjs';
const name = '20261118000100_notification_receipts',
  relative = 'BE/prisma/migrations/' + name + '/migration.sql',
  filepath = path.join(root, 'prisma/migrations', name, 'migration.sql');
const { client } = await readClient();
try {
  const row = (
    await client.query(
      'SELECT checksum,logs,"applied_steps_count" FROM "_prisma_migrations" WHERE migration_name=$1 AND rolled_back_at IS NULL AND finished_at IS NOT NULL',
      [name],
    )
  ).rows[0];
  const gitRoot = path.join(root, '..'),
    git = (args) =>
      execFileSync('git', args, {
        cwd: gitRoot,
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
      });
  const entries = git(['rev-list', '--objects', '--all', '--reflog'])
    .toString()
    .trim()
    .split('\n')
    .map((line) => ({ id: line.slice(0, 40), file: line.slice(41) }))
    .filter((x) => x.file.endsWith('/migration.sql'));
  const blobs = [...new Map(entries.map((x) => [x.id, x])).values()];
  let matched;
  for (const entry of blobs) {
    const bytes = git(['cat-file', 'blob', entry.id]),
      text = bytes.toString('utf8'),
      lf = text
        .split(String.fromCharCode(13, 10))
        .join(String.fromCharCode(10));
    for (const value of [
      text,
      lf,
      lf.split(String.fromCharCode(10)).join(String.fromCharCode(13, 10)),
    ])
      if (
        crypto.createHash('sha256').update(value).digest('hex') === row.checksum
      ) {
        matched = {
          text: value,
          source: 'Git blob ' + entry.id,
          path: entry.file,
        };
        break;
      }
    if (matched) break;
  }
  const stats =
    (
      await client.query(
        "SELECT extname FROM pg_extension WHERE extname='pg_stat_statements'",
      )
    ).rows.length > 0;
  let utilityQueries = 0;
  if (!matched && stats) {
    await client.query('SAVEPOINT original_sql_probe');
    try {
      const queries = (
        await client.query(
          "SELECT query FROM pg_stat_statements WHERE query ILIKE '%NotificationReceipt%' AND query ILIKE '%CREATE TABLE%' LIMIT 50",
        )
      ).rows;
      for (const { query } of queries) {
        if (!/^\s*(?:--[^\n]*\n\s*)*CREATE\s+TABLE/i.test(query)) continue;
        utilityQueries++;
        for (const text of [query, query + '\n'])
          if (
            crypto.createHash('sha256').update(text).digest('hex') ===
            row.checksum
          ) {
            matched = { text, source: 'pg_stat_statements exact checksum' };
            break;
          }
      }
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT original_sql_probe');
    }
  }
  await client.query('ROLLBACK');
  if (matched) {
    const prior = fs.readFileSync(filepath);
    const before = path.join(
      root,
      'artifacts',
      'notification-receipts-before-original-restoration.sql',
    );
    fs.writeFileSync(before, prior);
    fs.writeFileSync(filepath, matched.text);
    if (
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(filepath))
        .digest('hex') !== row.checksum
    )
      throw Error('Restoration checksum did not match');
    console.log(
      JSON.stringify({
        migration: name,
        resolved: true,
        source: matched.source,
        artifactPath: matched.path,
        appliedHistoryChanged: false,
      }),
    );
  } else {
    console.log(
      JSON.stringify({
        migration: name,
        resolved: false,
        blockedReason:
          'No authentic original artifact matches the stored checksum. Successful migration history does not contain original SQL; live DDL alone cannot recover its bytes.',
        gitMigrationBlobsChecked: blobs.length,
        appliedLogsAvailable: Boolean(row.logs),
        pgStatStatementsAvailable: stats,
        matchingUtilityQueriesChecked: utilityQueries,
        appliedSteps: row.applied_steps_count,
        appliedHistoryChanged: false,
      }),
    );
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  fail(error);
} finally {
  await client.end();
}
