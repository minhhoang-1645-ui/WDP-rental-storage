import test from 'node:test';
import assert from 'node:assert/strict';
import { guard, fingerprint, deletionOrder, assertAccounts, accounts } from './safety.mjs';
const url = 'postgresql://demo:unused@127.0.0.1:55439/nestbox_rv3_demo_test';
const env = { RV3_DEMO_MODE: 'ISOLATED_DEMO', RV3_DEMO_DATABASE_FINGERPRINT: fingerprint(url) };
test('writes need isolated mode, matching target and explicit confirmation', () => {
  assert.equal(guard(url, env, fingerprint(url)), fingerprint(url));
  for (const change of [{ NODE_ENV: 'production' }, { RV3_DEMO_MODE: '' }, { RV3_DEMO_DATABASE_FINGERPRINT: 'wrong' }, { DATABASE_URL: url }]) assert.throws(() => guard(url, { ...env, ...change }, fingerprint(url)));
  assert.throws(() => guard(url, env, undefined));
});
test('remote Supabase and ordinary local app databases cannot be mutated', () => {
  for (const unsafe of ['postgresql://demo:unused@db.example.supabase.co/postgres', 'postgresql://demo:unused@127.0.0.1/wdp_storage']) assert.throws(() => guard(unsafe, { ...env, RV3_DEMO_DATABASE_FINGERPRINT: fingerprint(unsafe) }, fingerprint(unsafe)));
});
test('alternate local host/user cannot bypass the application database protection', () => {
  assert.throws(() => guard(url, { ...env, DATABASE_URL: url.replace('127.0.0.1', 'localhost').replace('demo:unused', 'other:unused') }, fingerprint(url)));
  const ambiguous = url + '?host=remote.example';
  assert.throws(() => guard(ambiguous, { ...env, RV3_DEMO_DATABASE_FINGERPRINT: fingerprint(ambiguous) }, fingerprint(ambiguous)));
});
test('fingerprints contain no password and distinguish databases', () => {
  assert.equal(fingerprint(url), fingerprint(url.replace('unused', 'other-secret')));
  assert.notEqual(fingerprint(url), fingerprint(url + '_other'));
});
test('cleanup follows restrict and cascade foreign keys without disabling them', () => {
  assert.deepEqual(deletionOrder(['Reservation', 'Invoice', 'Payment'], [{ child: 'Payment', parent: 'Invoice' }, { child: 'Invoice', parent: 'Reservation' }]), ['Payment', 'Invoice', 'Reservation']);
  assert.throws(() => deletionOrder(['A', 'B'], [{ child: 'A', parent: 'B' }, { child: 'B', parent: 'A' }]));
});
test('missing/wrong/inactive accounts stop preparation', () => {
  const users = Object.entries(accounts).map(([role, email]) => ({ email, role, accountStatus: 'ACTIVE', passwordHash: `scrypt$${'a'.repeat(32)}$${'b'.repeat(128)}` }));
  assertAccounts(users); assert.throws(() => assertAccounts(users.slice(1)));
  assert.throws(() => assertAccounts(users.map((user, index) => index === 0 ? { ...user, accountStatus: 'DISABLED' } : user)));
});
