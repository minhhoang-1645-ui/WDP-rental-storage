import fs from 'node:fs';
import pg from 'pg';
import {
  historyState,
  type ReleaseContract,
  type MigrationRow,
} from '../scripts/release/guards.mjs';
export const releaseContract: ReleaseContract = JSON.parse(
  fs.readFileSync(
    new URL('../scripts/release/contract.json', import.meta.url),
    'utf8',
  ),
);
export async function inspectFoundationDatabase(
  raw = process.env.DATABASE_URL,
) {
  if (!raw) throw Error('DATABASE_URL is required.');
  let client: pg.Client | undefined;
  try {
    const url = new URL(raw);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.searchParams.has('options')
    )
      throw Error('Invalid database configuration');
    client = new pg.Client({
      connectionString: raw,
      options: '-c default_transaction_read_only=on',
      application_name: 'nestbox-release-readonly',
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
    });
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const target = {
      host: url.hostname.replace('-pooler.', '.'),
      database: decodeURIComponent(url.pathname.slice(1)),
    };
    const history = historyState(
      (
        await client.query(
          'SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations"',
        )
      ).rows as MigrationRow[],
      releaseContract,
    );
    const roles = (
      await client.query(
        `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='UserRole' AND n.nspname='public'`,
      )
    ).rows.map((r) => String(r.enumlabel));
    const columns = (
      await client.query(
        `SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'`,
      )
    ).rows.map((r) => r.table_name + '.' + r.column_name);
    const requiredColumns = [
      'AdditionalService.facilityId',
      'FacilityServiceOffering.additionalServiceId',
      'FacilityServiceOffering.facilityId',
      'FacilityServiceOffering.unitPrice',
      'FacilityServiceOffering.stockOnHand',
      'FacilityServiceOffering.rentalCapacity',
      'FacilityServiceOffering.configurationReview',
      'AuditEvent.metadata',
      'AuthSession.id',
      'AuthSession.createdAt',
      'AuthSession.revokedAt',
      'AuthSession.revokedById',
      'AuthSession.revocationReason',
      'AuthSession.device',
      'MaintenanceRequest.commonAreaFacilityId',
      'MaintenanceRequest.commonArea',
      'MaintenanceRequest.locationNote',
      'MaintenanceRequest.rentalImpact',
      'MaintenanceRequest.reportedAffectedUnitIds',
      'MaintenanceRequest.dispatchReadyAt',
      'MaintenancePhoto.id',
      'StorageUnit.bookingSafetyVersion',
      'IncidentUnitBlock.id',
      'StaffShift.id',
      'StaffShift.checkedInAt',
      'StaffShift.checkedOutAt',
      'Facility.serviceSchedule',
      'ReturnRequest.inspectionScheduledAt',
      'SupportRequest.customerWaitReason',
      'HandoverAppointment.handoverLeadDays',
      'OnlinePaymentReconciliation.externalReferenceKey',
      'OnlinePaymentReconciliation.onlinePaymentTransactionId',
      'OnlinePaymentReconciliation.paymentSubmissionId',
    ];
    const missingColumns = requiredColumns.filter((c) => !columns.includes(c));
    const receiptColumns = (
      await client.query(
        `SELECT column_name,data_type,datetime_precision,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='NotificationReceipt' ORDER BY ordinal_position`,
      )
    ).rows;
    const receiptConstraints = (
      await client.query(
        `SELECT contype,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=to_regclass('public."NotificationReceipt"') AND contype<>'n' ORDER BY contype`,
      )
    ).rows;
    const receiptSchemaMatches =
      receiptColumns.length === 3 &&
      receiptColumns.every((c) => c.is_nullable === 'NO') &&
      receiptColumns[0].column_name === 'userId' &&
      receiptColumns[0].data_type === 'text' &&
      receiptColumns[1].column_name === 'token' &&
      receiptColumns[1].data_type === 'text' &&
      receiptColumns[2].column_name === 'readAt' &&
      receiptColumns[2].datetime_precision === 3 &&
      receiptColumns[2].column_default === 'CURRENT_TIMESTAMP' &&
      receiptConstraints.length === 2 &&
      receiptConstraints.some(
        (c) => c.definition === 'PRIMARY KEY ("userId", token)',
      ) &&
      receiptConstraints.some(
        (c) =>
          c.definition ===
          'FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE',
      );
    const rolesMatch =
      roles.length === releaseContract.roles.length &&
      releaseContract.roles.every((r) => roles.includes(r));
    await client.query('ROLLBACK');
    return {
      release: releaseContract.release,
      target,
      ...history,
      rolesMatch,
      missingColumns,
      receiptSchemaMatches,
      ready:
        history.historyValid &&
        !history.pending.length &&
        rolesMatch &&
        !missingColumns.length &&
        receiptSchemaMatches,
    };
  } catch {
    throw Error(
      'Foundation database check failed. No database changes made; inspect the configured target with release:check.',
    );
  } finally {
    await client?.end().catch(() => {});
  }
}
export async function assertFoundationSchema() {
  const state = await inspectFoundationDatabase();
  if (!state.ready)
    throw Error(
      'Foundation schema is not ready: ' +
        JSON.stringify({
          pending: state.pending,
          failed: state.failed,
          unexpected: state.unexpected,
          mismatches: state.mismatches,
          missingColumns: state.missingColumns,
          rolesMatch: state.rolesMatch,
          receiptSchemaMatches: state.receiptSchemaMatches,
        }),
    );
  if (state.knownDivergences.length)
    console.warn(
      'Known historical checksum divergence retained: ' +
        releaseContract.historicalException.migration,
    );
}
