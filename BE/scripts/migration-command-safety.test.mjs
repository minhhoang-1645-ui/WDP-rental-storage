import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertMigrationTarget } from './migration-command-safety.mjs';
const remote = 'postgresql://test:fake@branch.example.neon.tech/test';
test('blocks remote resets, schema pushes and migration-history rewrites before connection', () => {
  for (const command of [
    ['migrate', 'dev'],
    ['migrate', 'reset', '--force'],
    ['migrate', 'resolve', '--applied', 'old'],
    ['db', 'push'],
    ['db', 'execute', '--file', 'change.sql'],
  ])
    assert.throws(() => assertMigrationTarget(remote, command), /Refusing/);
});
test('retains validation, inspection and reviewed migration deployment commands', () => {
  for (const command of [
    ['generate'],
    ['validate'],
    ['migrate', 'status'],
    ['migrate', 'deploy'],
    ['migrate', 'diff'],
    ['db', 'pull'],
  ])
    assert.doesNotThrow(() => assertMigrationTarget(remote, command));
});
test('allows disposable local migration workflows and help without making a connection', () => {
  assert.doesNotThrow(() =>
    assertMigrationTarget(
      'postgresql://test@127.0.0.1:55439/nestbox_foundation_test',
      ['migrate', 'reset'],
    ),
  );
  assert.doesNotThrow(() =>
    assertMigrationTarget(remote, ['migrate', 'dev', '--help']),
  );
});
