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
  if (!state.historyValid)
    throw Error('Cutover blocked: unexpected migration history.');
  if (!state.receiptSchemaMatches)
    throw Error('Cutover blocked: notification receipt schema differs.');
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
