import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  historyState,
  requireCutoverApproval,
  sameDatabase,
} from './guards.mjs';
const contract = JSON.parse(
  fs.readFileSync(new URL('./contract.json', import.meta.url)),
);
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
