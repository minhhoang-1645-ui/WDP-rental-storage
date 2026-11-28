export const recoverableMigration = '20261126000100_single_facility_and_relocation_decision';

export function assertMigrationTarget(connectionString, args) {
  const target = new URL(connectionString);
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(
    target.hostname,
  );
  if (local || args.includes('--help') || args.includes('-h')) return;
  // The release runner passes this only after the verified backup and recovery checks.
  if (
    process.env.NESTBOX_RELEASE_RESOLVE_FAILED === recoverableMigration &&
    args.join(' ') === 'migrate resolve --rolled-back ' + recoverableMigration
  ) return;
  const migration = args.indexOf('migrate'),
    database = args.indexOf('db');
  const unsafeMigration =
    migration >= 0 &&
    args
      .slice(migration + 1)
      .some((v) => ['dev', 'reset', 'resolve'].includes(v));
  const unsafeDatabase =
    database >= 0 &&
    args.slice(database + 1).some((v) => ['push', 'execute'].includes(v));
  if (unsafeMigration || unsafeDatabase)
    throw new Error(
      'Refusing destructive/schema-history commands against a remote database. Use the isolated test database; production migration history must be reviewed separately.',
    );
}
