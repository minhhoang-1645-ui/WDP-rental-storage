# NestBox five-role Backend cutover

Prepared release branch: `codex/nestbox-five-role-foundation-release-20261124`.

The deposit refund deadline release requires additive migration `20261125000100_deposit_refund_deadline`.
Policy charge documents also require `20261125000200_policy_charge_invoices` before startup.
Paid cancellations, transfer settlements and occupancy charges require `20261125000300_operational_policy_settlements`.
Apply it through the isolated rehearsal and approved cutover below before starting the new backend.
Existing settlements keep null deadlines. New settlements with a deposit persist the deadline and rule version at physical handover.
Old Render Backend: `dev@2388bc5` (operator confirmed).
No production migration or deployment is authorized by this preparation.

## Release checks (safe to run before approval)

From `BE`:
```sh
npm ci --include=dev
npm run build
npm run test:release-safety
npm run release:check
```

`release:check` reads only. Exit 2 means schema is incomplete. It prints the database host/name, pending migrations and the known historical checksum divergence, without credentials.
The start entrypoint verifies the foundation schema **before creating Nest providers or starting workers**. Build/start never run migrations.
Use the existing Render service with the settings in `render-release.json`; Auto-Deploy must be disabled before changing its deployment branch. No Blueprint/new service is created.

## Cutover, only after explicit approval

1. Record the exact release commit and publish **only the release branch** after authorization. Never push/merge `dev` for this cutover. Verify the same commit builds successfully.
2. In the existing Render service, verify both configured database targets using the shell command below; compare with `release:check`. The user's confirmation that URLs were updated does not establish their exact host/database:
   ```sh
   node -e 'for(const k of ["DATABASE_URL","DIRECT_URL"]){const u=new URL(process.env[k]);console.log(k,{host:u.hostname.replace("-pooler.","."),database:decodeURIComponent(u.pathname.slice(1))});}'
   ```
3. Pause new bookings/payments at the client entry points. Let already initiated payments settle or retain a gateway/bank reconciliation queue. **Fully stop/suspend the old Backend, workers, cron jobs and other database writers.** HTTP maintenance alone does not stop its immediate expiration sweep. Preserve external callback evidence; never acknowledge an unrecorded receipt as paid.
4. Take a full database backup while writers are stopped and rehearse recovery/migrations in an isolated database. The existing verified archive is reusable only if all original table fingerprints still match the live database. The migration tool enforces this; changed data requires a fresh full backup/rehearsal.
5. Copy `cutover-approval.template.json` into a private `artifacts` directory and fill explicit approval, UTC approval time, exact release SHA, verified Neon target, full-stop confirmation, checksum-exception acceptance, and the verified rehearsal manifest path. An unfilled template cannot authorize migration.
6. On the reviewed release with a clean Backend working tree:
   ```sh
   npm run release:migrate -- --approve-production-cutover --all-writers-stopped --accept-documented-checksum-divergence --approval-record=/absolute/private/approval.json
   ```
   It validates release SQL hashes, the same runtime/direct target, the exact approved Git commit, a verified full backup matching all live original tables, zero blocking preflight conflicts, and unchanged receipt structure. Migrations run in order: 00300, 00400, 00500, 20261124000100 (TAPE evidence), 20261124000200 (shared catalog). Each pending migration has bounded transaction lock/statement timeouts.
7. Keep writers stopped. The tool verifies the final schema and original business records/IDs and old migration rows/checksums. Any failure stops the process and keeps the release blocked.
8. Manually deploy the **exact approved release commit** to the existing Render service with Auto-Deploy off. Build: `npm ci --include=dev && npm run build`; start: `npm run start:prod`; one instance. Do not put migration commands in build/start/pre-deploy settings.
9. Check `/api/health` (roleModel 5, exact Render commit), `/api/health/ready`, and `/api/docs-json`. Run scoped acceptance using existing authorized accounts: login roles, customer ownership, manager facility restrictions, staff assigned tasks, shared catalog supply, document access. Do not silently create accounts or grants.
10. Reopen clients only after compatible Web/Mobile consumers are also deployed or verified. This branch packages Backend only; existing Web/Mobile foundation changes remain separate. Reconcile queued gateway/bank receipts using the existing ledgers.

## Historical checksum reconciliation

The original `20261118000100_notification_receipts` SQL cannot currently be recovered. The live table/PK/FK match the repository, but the historical hash differs.
The release contract pins **both** the actual applied hash and the repository LF/CRLF hashes. This is an explicit, visible exception, not a corrected checksum.
The migration tool requires explicit acceptance and never calls `migrate resolve/reset/dev`, `db push`, or updates old migration metadata. Every other unexpected checksum/failure blocks.
If acceptance is not approved, keep production migration blocked until an authentic SQL artifact matching the applied hash is recovered.

## Recovery

- **Before reopening writes:** keep all writers stopped. Preserve the failed release logs and database. If repair is needed, restore the verified full archive to a **new isolated Neon branch/database**, verify recovery, correct/rehearse the forward migration, and point both Render URLs to the verified recovery target. This needs separate operational approval. Do not overwrite the original database or pretend a failed migration succeeded.
- **Backend startup/deploy failure after schema migration:** keep the additive schema and use a repaired five-role release. `2388bc5` is not a compatible rollback target: Neon already has five-role enum migrations applied.
- **After reopening writes:** prefer forward repair. Restoring an old snapshot would discard later bookings/receipts; it requires a separately approved recovery/replay plan preserving the external payment ledger and subsequent business events.
- Never reset Neon, erase financial records, or run rollback SQL automatically. A failed transactional migration may leave a failed Prisma row; preserve it for explicit reconciliation/recovery rather than repeatedly retrying or rewriting history.
