const raw = process.env.NESTBOX_RECOVERY_DATABASE_URL ?? '',
  u = new URL(raw || 'https://invalid.test');
if (
  process.env.NESTBOX_RECOVERY_ENABLED !== '1' ||
  u.hostname !== '127.0.0.1' ||
  u.port !== '55440' ||
  u.pathname !== '/nestbox_foundation_restore' ||
  u.search ||
  process.env.DATABASE_URL !== raw ||
  process.env.DIRECT_URL !== raw
)
  throw Error('Only isolated recovery database allowed.');
const { inspectFoundationDatabase, assertFoundationSchema, releaseContract } =
  await import('../../dist/foundation-schema.js');
const state = await inspectFoundationDatabase();
if (process.argv[2] === 'before') {
  if (state.ready || !state.historyValid || !state.pending.length ||
      state.pending.some(name => !releaseContract.requiredMigrations.includes(name)))
    throw Error('Expected incomplete foundation schema before rehearsal');
  let refused = false;
  try {
    await assertFoundationSchema();
  } catch {
    refused = true;
  }
  if (!refused) throw Error('Backend must refuse startup before migration');
} else if (process.argv[2] === 'after') {
  if (!state.ready) throw Error('Foundation schema not ready after migration');
  await assertFoundationSchema();
} else throw Error('Pass before or after');
console.log(
  JSON.stringify({
    startupSchemaGuard: process.argv[2],
    passed: true,
    applicationStarted: false,
    databaseWrites: 0,
  }),
);
