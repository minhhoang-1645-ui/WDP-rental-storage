import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { root, readClient, fail } from './common.mjs';
const { client, connection } = await readClient();
try {
  console.log(
    JSON.stringify({
      target: connection.identity,
      metadata: (
        await client.query(
          "SELECT current_database() AS database,current_setting('server_version') AS version",
        )
      ).rows[0],
    }),
  );
  const history = (
    await client.query(
      'SELECT migration_name,checksum,finished_at FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
    )
  ).rows;
  console.log(
    JSON.stringify({
      appliedCount: history.length,
      lastApplied: history.at(-1).migration_name,
      accounts: (
        await client.query('SELECT count(*)::int AS count FROM "User"')
      ).rows[0].count,
    }),
  );
  const migration = '20261118000100_notification_receipts',
    original = history.find((x) => x.migration_name === migration);
  const filepath = path.join(
      root,
      'prisma/migrations',
      migration,
      'migration.sql',
    ),
    current = fs.readFileSync(filepath, 'utf8').replaceAll('\r\n', '\n');
  const hashes = [];
  function check(sql, reason) {
    for (const text of [sql, sql.replaceAll('\n', '\r\n')])
      if (
        crypto.createHash('sha256').update(text).digest('hex') ===
        original.checksum
      )
        hashes.push({ sql: text, reason });
  }
  for (const end of ['', '\n', '\n\n', '\n\n\n'])
    check(
      current.trimEnd() + end,
      'current SQL with trailing-newline normalization',
    );
  const create =
    'CREATE TABLE "NotificationReceipt" (\n    "userId" TEXT NOT NULL,\n    "token" TEXT NOT NULL,\n    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\n    CONSTRAINT "NotificationReceipt_pkey" PRIMARY KEY ("userId", "token")\n);';
  const foreign =
    'ALTER TABLE "NotificationReceipt" ADD CONSTRAINT "NotificationReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;';
  for (const comments of [false, true])
    for (const end of ['', '\n', '\n\n'])
      for (const gap of ['\n', '\n\n'])
        check(
          (comments ? '-- CreateTable\n' : '') +
            create +
            gap +
            (comments ? '-- AddForeignKey\n' : '') +
            foreign +
            end,
          'standard Prisma CREATE TABLE + ADD FOREIGN KEY form',
        );
  const commits = execFileSync(
    'git',
    [
      'log',
      '--all',
      '--reflog',
      '--format=%H',
      '--',
      'BE/prisma/migrations/' + migration + '/migration.sql',
    ],
    { cwd: path.join(root, '..'), encoding: 'utf8', windowsHide: true },
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const commit of new Set(commits)) {
    try {
      const sql = execFileSync(
        'git',
        [
          'show',
          commit + ':BE/prisma/migrations/' + migration + '/migration.sql',
        ],
        { cwd: path.join(root, '..'), encoding: 'utf8', windowsHide: true },
      );
      check(sql, 'Git ' + commit);
    } catch {}
  }
  console.log(
    JSON.stringify({
      checksumInvestigation: {
        migration,
        matchingArtifacts: hashes.map(({ reason, sql }) => ({
          reason,
          bytes: Buffer.byteLength(sql),
        })),
        gitRevisions: commits.length,
        liveConstraints: (
          await client.query(
            "SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='NotificationReceipt') ORDER BY conname",
          )
        ).rows,
      },
    }),
  );
  if (hashes.length) {
    const applied = hashes[0];
    fs.writeFileSync(filepath + '.recovered', applied.sql, { flag: 'wx' });
  }
  const services = (
    await client.query(
      'SELECT id,code,name,kind::text,"isActive" FROM "AdditionalService" ORDER BY code',
    )
  ).rows;
  const refs = await client.query(`
 SELECT s.id AS service_id,r."facilityId" AS facility_id,'reservation' AS source,r.status::text AS status,count(*)::int AS count
 FROM "AdditionalService" s JOIN "ReservationService" rs ON rs."additionalServiceId"=s.id JOIN "Reservation" r ON r.id=rs."reservationId" GROUP BY s.id,r."facilityId",r.status
 UNION ALL
 SELECT s.id,g."facilityId",'guest',g.status::text,count(*)::int FROM "AdditionalService" s JOIN "GuestBookingService" gs ON gs."additionalServiceId"=s.id JOIN "GuestBookingRequest" g ON g.id=gs."guestBookingRequestId" GROUP BY s.id,g."facilityId",g.status
 UNION ALL
 SELECT s.id,r."facilityId",'reservation-snapshot',r.status::text,count(*)::int FROM "AdditionalService" s JOIN "Reservation" r ON jsonb_path_exists(r."quoteSnapshot",'$.** ? (@ == $id || @ == $code)',jsonb_build_object('id',s.id,'code',s.code),true) GROUP BY s.id,r."facilityId",r.status
 UNION ALL
 SELECT s.id,g."facilityId",'guest-snapshot',g.status::text,count(*)::int FROM "AdditionalService" s JOIN "GuestBookingRequest" g ON jsonb_path_exists(g."quoteSnapshot",'$.** ? (@ == $id || @ == $code)',jsonb_build_object('id',s.id,'code',s.code),true) GROUP BY s.id,g."facilityId",g.status
 `);

  const columns = (
    await client.query(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('json','jsonb') AND table_name=ANY($1::text[]) ORDER BY table_name,column_name",
      [
        [
          'Reservation',
          'GuestBookingRequest',
          'Invoice',
          'RentalContract',
          'RenewalRequest',
          'TransferRequest',
        ],
      ],
    )
  ).rows;
  const snapshotRefs = [];
  for (const column of columns) {
    const own = ['Reservation', 'GuestBookingRequest'].includes(
      column.table_name,
    );
    const table = '"' + column.table_name + '"',
      field = '"' + column.column_name + '"',
      source = column.table_name + '.' + column.column_name;
    const group = own ? 'owner."facilityId"' : 'r."facilityId"';
    const join = own
      ? ''
      : ' JOIN "Reservation" r ON r.id=owner."reservationId"';
    const query =
      'SELECT s.id AS service_id,' +
      group +
      ' AS facility_id,$1::text AS source,count(*)::int AS count FROM "AdditionalService" s JOIN ' +
      table +
      ' owner ON jsonb_path_exists(owner.' +
      field +
      "::jsonb,'$.** ? (@ == $id || @ == $code)',jsonb_build_object('id',s.id,'code',s.code),true)" +
      join +
      ' GROUP BY s.id,' +
      group;
    snapshotRefs.push(...(await client.query(query, [source])).rows);
  }
  refs.rows.push(...snapshotRefs);
  console.log(JSON.stringify({ snapshotSources: columns }));
  console.log(
    JSON.stringify({
      facilities: (
        await client.query('SELECT id,code,name FROM "Facility" ORDER BY code')
      ).rows,
      services: services.map((s) => ({
        ...s,
        usage: refs.rows
          .filter((r) => r.service_id === s.id)
          .map(({ service_id, ...r }) => r),
      })),
    }),
  );
  const receiptStats = await client.query(
    'SELECT count(*)::int AS count FROM "NotificationReceipt"',
  );
  console.log(
    JSON.stringify({
      receiptCount: receiptStats.rows[0].count,
      readOnly: true,
    }),
  );
  await client.query('ROLLBACK');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  fail(error);
} finally {
  await client.end();
}
