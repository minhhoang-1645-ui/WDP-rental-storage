import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { archiveHash, assertArchive, legacyCatalogRehearsal, postgresTools, releaseManifestVerified, sameFingerprint } from './rehearsal-checks.mjs';

test('locates a complete matching PostgreSQL distribution outside the default install directory', () => {
  const dir = path.resolve('alternative', 'pg', 'bin');
  const probe = binary => path.dirname(binary) === dir ? '18.7' : null;
  assert.equal(postgresTools('180007', { PG_BIN_DIR: dir }, probe).expectedMajor, 18);
  assert.equal(postgresTools('180007', { PATH: dir }, probe).versions.pg_restore, '18.7');
});

test('rejects an older dump tool, a mismatched cluster, and missing executables', () => {
  const env = { PG_BIN_DIR: 'configured' };
  assert.throws(() => postgresTools('180007', env, () => '17.12'), /PostgreSQL 18 tooling required/);
  for (const version of ['17.12', null]) {
    assert.throws(() => postgresTools('180007', env, name => /[\\/]postgres(?:\.exe)?$/.test(name) ? version : '18.7'), /tooling required/);
  }
});

test('payOS rehearsal accepts unchanged one- or multi-offering snapshots and rejects added, deleted or edited rows', () => {
  assert.equal(legacyCatalogRehearsal(['20261124000200_shared_service_catalog'], undefined), true);
  assert.equal(legacyCatalogRehearsal(['20261127000600_payos_payin'], undefined), false);
  for (const count of ['1', '8']) {
    const snapshot = { count, fingerprint: 'original-catalog' };
    assert.equal(sameFingerprint(snapshot, { ...snapshot }), true);
    assert.equal(sameFingerprint(snapshot, null), false);
    for (const changed of [
      { ...snapshot, count: String(Number(count) + 1) },
      { ...snapshot, count: String(Number(count) - 1) },
      { ...snapshot, fingerprint: 'edited-unit-or-facility' },
    ]) assert.equal(sameFingerprint(snapshot, changed), false);
  }
});

test('rejects a changed archive even if it remains in the private directory', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nestbox-archive-test-'));
  const archive = path.join(directory, 'fixture.dump');
  try {
    fs.writeFileSync(archive, 'archive');
    const checksum = archiveHash(archive);
    assert.doesNotThrow(() => assertArchive(archive, checksum, directory));
    fs.writeFileSync(archive, 'altered');
    assert.throws(() => assertArchive(archive, checksum, directory), /path\/hash/);
  } finally {
    fs.unlinkSync(archive);
    fs.rmdirSync(directory);
  }
});

test('cutover rejects failed restore or rehearsal, running cluster, stale SHA and preliminary manifests', () => {
  const valid = { releaseCommit: 'release', preliminary: false,
    recovery: { restored: true, allTablesIdentical: true }, rehearsal: { passed: true }, localClusterStopped: true };
  assert.equal(releaseManifestVerified(valid, 'release'), true);
  for (const manifest of [
    { ...valid, preliminary: true },
    { ...valid, releaseCommit: 'old' },
    { ...valid, recovery: { restored: true, allTablesIdentical: false } },
    { ...valid, recovery: { restored: false, allTablesIdentical: true } },
    { ...valid, rehearsal: { passed: false } },
    { ...valid, localClusterStopped: false },
    { ...valid, error: { code: 'REHEARSAL_FAILED' } },
  ]) assert.equal(releaseManifestVerified(manifest, 'release'), false);
});

test('payOS migration is required by the isolated startup guard', () => {
  const contract = JSON.parse(fs.readFileSync(new URL('../release/contract.json', import.meta.url), 'utf8'));
  assert.ok(contract.requiredMigrations.includes('20261127000600_payos_payin'));
});
