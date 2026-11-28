export interface MigrationRow {
  migration_name: string;
  checksum: string;
  finished_at: unknown;
  rolled_back_at: unknown;
}
export interface ReleaseContract {
  release: string;
  roles: string[];
  requiredMigrations: string[];
  migrations: Array<{ name: string; checksums: string[] }>;
  historicalException: {
    migration: string;
    appliedChecksum: string;
    repositoryChecksums: string[];
  };
}
export interface HistoryState {
  failed: string[];
  unexpected: string[];
  mismatches: string[];
  knownDivergences: unknown[];
  pending: string[];
  historyValid: boolean;
}
export function historyState(
  rows: MigrationRow[],
  contract: ReleaseContract,
): HistoryState;
export function requireCutoverApproval(
  args: string[],
  state: HistoryState & { receiptSchemaMatches: boolean },
): void;
export function sameDatabase(a: string, b: string): boolean;
