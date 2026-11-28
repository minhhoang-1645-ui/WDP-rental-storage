import { recoverableMigration } from '../migration-command-safety.mjs';

export function historyState(rows, contract) {
  const known = new Map(contract.migrations.map((m) => [m.name, m]));
  const failed = rows
    .filter((r) => !r.finished_at && !r.rolled_back_at)
    .map((r) => r.migration_name);
  const applied = rows.filter((r) => r.finished_at && !r.rolled_back_at);
  const unexpected = [],
    mismatches = [],
    knownDivergences = [];
  for (const row of applied) {
    const file = known.get(row.migration_name);
    if (!file) {
      unexpected.push(row.migration_name);
      continue;
    }
    if (file.checksums.includes(row.checksum)) continue;
    const exception = contract.historicalException;
    if (
      row.migration_name === exception.migration &&
      row.checksum === exception.appliedChecksum &&
      file.checksums.every((c) => exception.repositoryChecksums.includes(c))
    )
      knownDivergences.push({
        migration: row.migration_name,
        appliedChecksum: row.checksum,
        repositoryChecksums: file.checksums,
      });
    else mismatches.push(row.migration_name);
  }
  const names = new Set(applied.map((r) => r.migration_name));
  const pending = contract.migrations
    .filter((m) => !names.has(m.name))
    .map((m) => m.name);
  return {
    failed,
    unexpected,
    mismatches,
    knownDivergences,
    pending,
    historyValid: !failed.length && !unexpected.length && !mismatches.length,
  };
}
export function requireCutoverApproval(args, state) {
  for (const flag of [
    '--approve-production-cutover',
    '--all-writers-stopped',
    '--accept-documented-checksum-divergence',
  ])
    if (!args.includes(flag))
      throw Error('Cutover blocked: missing explicit ' + flag);
  if (!state.historyValid && !canRecoverFailedMigration(args, state))
    throw Error('Cutover blocked: unexpected migration history.');
  if (!state.receiptSchemaMatches)
    throw Error('Cutover blocked: notification receipt schema differs.');
}
export function canRecoverFailedMigration(args, state) {
  return args.includes('--recover-single-facility-migration') &&
    state.failed.length === 1 && state.failed[0] === recoverableMigration &&
    state.pending.length === 1 && state.pending[0] === recoverableMigration &&
    !state.unexpected.length && !state.mismatches.length;
}

export async function verifyFailedMigration(client, state, contract, args) {
  if (!canRecoverFailedMigration(args, state))
    throw Error('Only the recorded single-facility migration failure can be recovered.');
  const history = (await client.query(
    'SELECT * FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NULL AND rolled_back_at IS NULL',
    [recoverableMigration],
  )).rows;
  const file = contract.migrations.find(entry => entry.name === recoverableMigration);
  if (history.length !== 1 || history[0].applied_steps_count !== 0 ||
      !file?.checksums.includes(history[0].checksum))
    throw Error('The failed migration checksum or applied step count differs.');
  const { partial, invalidAccess } = (await client.query(`
    SELECT (
      to_regclass('public."FacilityAccess_one_active_per_user"') IS NOT NULL OR
      EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='TransferRequest' AND column_name='destinationDecision')
    ) AS partial, (
      EXISTS (SELECT 1 FROM "FacilityAccess" WHERE "revokedAt" IS NULL
              GROUP BY "userId" HAVING count(*) > 1) OR
      EXISTS (SELECT 1 FROM "FacilityAccess" a JOIN "User" u ON u.id=a."userId"
              WHERE a."revokedAt" IS NULL AND u.role NOT IN ('FACILITY_STAFF', 'FACILITY_MANAGER'))
    ) AS "invalidAccess"
  `)).rows[0];
  if (partial || invalidAccess)
    throw Error('Recovery blocked by partial schema changes or invalid active facility access.');
  return history[0].id;
}

export function assertRecoveredHistory(before, after, recoveredId) {
  if (recoveredId && !after.find(row => row.id === recoveredId)?.rolled_back_at)
    throw Error('The failed attempt was not recorded as rolled back.');
  const comparable = after.map(row =>
    row.id === recoveredId ? { ...row, rolled_back_at: null } : row,
  );
  if (JSON.stringify(comparable) !== JSON.stringify(before))
    throw Error('Historical migration records changed.');
}

export function sameDatabase(a, b) {
  try {
    const x = new URL(a),
      y = new URL(b);
    return (
      ['postgres:', 'postgresql:'].includes(x.protocol) &&
      ['postgres:', 'postgresql:'].includes(y.protocol) &&
      x.hostname.replace('-pooler.', '.') ===
        y.hostname.replace('-pooler.', '.') &&
      decodeURIComponent(x.pathname) === decodeURIComponent(y.pathname)
    );
  } catch {
    return false;
  }
}
