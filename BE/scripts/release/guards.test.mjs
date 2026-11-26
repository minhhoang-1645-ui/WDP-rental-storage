import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  assertRecoveredHistory,
  historyState,
  verifyFailedMigration,
  requireCutoverApproval,
  sameDatabase,
} from './guards.mjs';
const contract = JSON.parse(
  fs.readFileSync(new URL('./contract.json', import.meta.url)),
);
const facilityMigration = '20261126000100_single_facility_and_relocation_decision';
const rows = contract.migrations.map((m) => ({
  migration_name: m.name,
  checksum: m.checksums[0],
  finished_at: 'done',
  rolled_back_at: null,
}));
test('known checksum divergence stays visible; arbitrary checksum changes block release', () => {
  const sample = structuredClone(rows),
    row = sample.find(
      (r) => r.migration_name === contract.historicalException.migration,
    );
  row.checksum = contract.historicalException.appliedChecksum;
  assert.equal(historyState(sample, contract).knownDivergences.length, 1);
  row.checksum = 'unexpected';
  assert.equal(historyState(sample, contract).historyValid, false);
});
test('unfinished migrations and missing required migrations prevent readiness', () => {
  const sample = structuredClone(rows);
  sample.at(-1).finished_at = null;
  const state = historyState(sample, contract);
  assert.equal(state.failed.length, 1);
  assert.equal(state.pending.length, 1);
  assert.equal(state.historyValid, false);
});
test('an unlisted applied migration blocks startup despite otherwise clean history', () => {
  const unexpected = '20990101000100_unlisted_migration';
  const state = historyState([
    ...rows,
    { migration_name: unexpected, checksum: 'unlisted', finished_at: 'done', rolled_back_at: null },
  ], contract);
  assert.deepEqual(state.unexpected, [unexpected]);
  assert.deepEqual(state.pending, []);
  assert.deepEqual(state.failed, []);
  assert.deepEqual(state.mismatches, []);
  assert.equal(state.historyValid, false);
});

test('the release contract covers every migration file with a matching checksum', () => {
  const root = new URL('../../prisma/migrations/', import.meta.url);
  const names = fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  assert.deepEqual(contract.migrations.map(entry => entry.name).sort(), names);
  for (const { name, checksums } of contract.migrations) {
    const sql = fs.readFileSync(new URL(name + '/migration.sql', root));
    const checksum = createHash('sha256').update(sql).digest('hex');
    assert.ok(checksums.includes(checksum), 'Release contract checksum mismatch for ' + name);
  }
});

test('production cutover requires all three explicit approvals and matching receipt schema', () => {
  const state = { ...historyState(rows, contract), receiptSchemaMatches: true };
  assert.throws(() => requireCutoverApproval([], state));
  const args = [
    '--approve-production-cutover',
    '--all-writers-stopped',
    '--accept-documented-checksum-divergence',
  ];
  assert.doesNotThrow(() => requireCutoverApproval(args, state));
  assert.throws(() =>
    requireCutoverApproval(args, { ...state, receiptSchemaMatches: false }),
  );
});
test('P3009 recovery requires explicit approval, exact history and untouched schema', async () => {
  const sample = structuredClone(rows);
  const failed = sample.find(row => row.migration_name === facilityMigration);
  Object.assign(failed, { id: 'failed-attempt', finished_at: null, applied_steps_count: 0 });
  const state = { ...historyState(sample, contract), receiptSchemaMatches: true };
  const approvals = ['--approve-production-cutover', '--all-writers-stopped', '--accept-documented-checksum-divergence'];
  assert.throws(() => requireCutoverApproval(approvals, state), /migration history/);
  const args = [...approvals, '--recover-single-facility-migration'];
  assert.doesNotThrow(() => requireCutoverApproval(args, state));
  assert.throws(() => requireCutoverApproval(args, { ...state, failed: [...state.failed, 'another'] }));
  const client = (row = failed, schema = { partial: false, invalidAccess: false }) => ({
    query: async (_sql, params) => ({ rows: params ? [row] : [schema] }),
  });
  assert.equal(await verifyFailedMigration(client(), state, contract, args), failed.id);
  await assert.rejects(verifyFailedMigration(client({ ...failed, checksum: 'different' }), state, contract, args), /checksum/);
  for (const schema of [{ partial: true, invalidAccess: false }, { partial: false, invalidAccess: true }])
    await assert.rejects(verifyFailedMigration(client(failed, schema), state, contract, args), /Recovery blocked/);
  const resolved = { ...failed, rolled_back_at: 'now' };
  assert.doesNotThrow(() => assertRecoveredHistory([failed], [resolved], failed.id));
  assert.throws(() => assertRecoveredHistory([failed], [{ ...resolved, checksum: 'changed' }], failed.id));
});

test('pooled/direct URLs must identify the same database without revealing credentials', () => {
  assert.equal(
    sameDatabase(
      'postgresql://u:p@ep-sample-pooler.region.neon.tech/db',
      'postgresql://u:other@ep-sample.region.neon.tech/db',
    ),
    true,
  );
  assert.equal(
    sameDatabase(
      'postgresql://u:p@a.neon.tech/one',
      'postgresql://u:p@a.neon.tech/two',
    ),
    false,
  );
});
