# Staff Transfer / Support data audit — 2026-11-10

Read-only evidence: current source, PostgreSQL information_schema, Prisma SELECTs and live authenticated API GETs. No seed, migration or business mutation. Login creates only the normal session. Counts below describe the current database sample, not guarantees about every deployment or proof of external banking/physical work.

## Support fields

Actual SupportRequest rows: **17**. States: OPEN 5, ASSIGNED 2, IN_PROGRESS 1, RESOLVED 9. Physical database columns verified in information_schema, not just schema.prisma.

| UI field | Database / API field | Populated now | Who/what writes it; relevance |
|---|---|---:|---|
| Processing start | SupportRequest.startedAt | 5/17 | Assigned Staff POST /staff/support-requests/:id/start, ASSIGNED → IN_PROGRESS; automatic server timestamp. Empty before start is valid. |
| Resolution time | resolvedAt | 9/17 | Staff resolve IN_PROGRESS or Manager resolve ESCALATED; server timestamp. Relevant after resolution. |
| Resolution approach | resolutionType | 9/17 | Staff/Manager select an allowed resolution in the existing resolve form; service validates per-role options. |
| Resolution description | resolutionNote | 9/17 | Staff/Manager enter the required resolution note in the same action. |
| Escalation time | escalatedAt | 1/17 | Assigned Staff escalate from IN_PROGRESS; server timestamp, retained after later resolution. |
| Escalation reason | escalationReason | 1/17 | Staff enters `reason` in escalate form; service writes it to escalationReason. `escalationNote` is not this database/API property. |
| Next assignment/allocation schedule | nextConfirmedAllocation | 0/17 | NOT a SupportRequest column or an employee assignment appointment. Derived from future confirmed, unreleased ReservationUnit allocations of the affected storage unit. Created through booking/allocation, not a Staff Support field. |

Live `GET /api/staff/support-requests`: first six fields exist on all 17 objects (nullable) and populated counts match the database. nextConfirmedAllocation and hasFutureAllocation are absent in this operational view. Live `GET /api/staff/management/support-requests`, used by the shared management-style screens: nextConfirmedAllocation is null for all 17; hasFutureAllocation is **real false for all 17**, not absent. This route uses the existing manager-shaped view through StaffWorkflow metadata. No backend permission/contract was changed.

Thus none of the first six fields is a fake field or universally unused. Current zero future allocations does not justify deleting future scheduling capability. Unknown/missing ≠ false. Staff-only display now hides optional null/undefined/blank values, retains false and zero, and does not emit a fabricated “Không”.

## Other empty fields audited from actual Staff management endpoints

All listed responses fit in the requested 100-row page; no counts were extrapolated. `/inquiries` returns mixed request types, so its total is not a pure contact-inquiry count.

| Domain / sample | Empty field evidence | Source/writer and UI decision |
|---|---|---|
| Reservations, 53 | contactedAt 53; processedBy 53; notes 48; expiresAt 40 | toManagerReservation explicitly sets contactedAt/processedBy to null; no matching Reservation columns. They belong to ContactInquiry's contact workflow. Hide on reservation, do not add inputs. Notes optional; hold deadline depends on lifecycle. |
| Mixed inquiries, 55 | contactedAt 54; processedBy 54; notes 49 | Real ContactInquiry contact timestamp set at CONTACTED; processor populated by inquiry update. Mixed reservation rows carry synthetic null contact fields. Keep existing contact form; hide empty optional fields. |
| Appointments, 17 | note 15; handoverNote 11; completedAt 7; cancelledAt 17 | Notes/reports and completion/cancellation metadata depend on executed actions. Preserve handover validation/forms; empty cancellation time does not imply broken data. |
| Stock movements, 8 | note 8; completionNote 7; completedAt 1 | Customer request note / Staff completion note optional; completion actor/time server-generated when completed. Actual quantity remains visibly “Chưa kiểm đếm” if null, not zero. |
| Renewals, 10 | rejectedAt/rejectionReason 10; appendix 2; reviewedBy 6 | Reject action supplies reason/time; appendix generated on approval; automatic approval can have no human reviewer. No fake actor or rejection details. |
| Transfers, 5 | toUnit 2; approvedAt 2; completedAt 2 | Staff chooses target during approval and completes physical move later. No destination before selection is expected; preserve transfer steps. |
| Returns, 5 | physicallyReturnedAt 2; completedAt 4; note 2 | Staff physical inspection/receipt and financial settlement are distinct; no invented completion time. |
| Maintenance, 5 | startedAt/workCompletedAt/workNote/verificationNote/verifiedAt all 5; nextConfirmedAllocation 5 | Real maintenance execution/verification columns exist; workNote entered by assigned Staff, verificationNote by Manager; timestamps server-generated. Current cases have no recorded execution/verification. Future allocation remains derived; returnContext is optional for non-return-origin cases. |

## Mappings and implementation fixes

- Classified escalationReason/escalatedAt/escalatedBy into Staff response/history sections with Vietnamese labels, rather than leaving real escalation data under technical leftovers. The old escalationNote alias alone did not map actual escalationReason.
- Staff RecordView no longer renders null scalar fields or empty nested objects; Facts hides optional absent values. Real false and numeric zero survive. Other roles retain existing null rendering.
- Preserve meaningful absence such as unassigned worker (“Chưa phân công”) and actual stock quantity not yet counted; do not fabricate values.
- No database-backed field, API property or action was removed. Empty data is hidden in presentation, not deleted from database.

## Transfer UI and authorization

`operations/staff-transfers.tsx` now owns the Staff transfer list: Customer requests and Transfer orders have separate search/status state, real existing endpoints and compact rows. Customer row opens original Support detail; order row opens Transfer detail. No repeated intake buttons in rows. Orders tab has one compact creation action for authenticated Staff. StaffWorkflow/roles guard and backend active-contract/source occupancy/same-reservation/target availability checks remain authoritative.

Intake appears only in request detail when the request is a transfer request, its current state allows intake, no non-rejected transfer already exists, and the active-contract lookup provides a contract from the same reservation. Linked transfers open directly instead. Contract lookup failure does not invent eligibility. Creation still uses the existing form and backend validation. Remaining limitation: the API does not supply a dedicated `canIntake` capability, so source occupancy/concurrency can still reject submission; the UI never overrides that rejection.

## Evidence paths

- `BE/prisma/schema.prisma` SupportRequest, ContactInquiry, Reservation, MaintenanceRequest.
- `BE/src/modules/support/support.service.ts`: start, resolveStaff, escalate, resolveManager, include, toView.
- `BE/src/modules/support/{staff-support,manager-support}.controller.ts`; `BE/src/modules/auth/roles.guard.ts`.
- `BE/src/modules/booking/booking.service.ts`: toManagerInquiry/toManagerReservation.
- `BE/src/modules/{maintenance,appointments,stock-movements,renewals,transfers,returns}/` services.
- `mobile/src/operations/{actions,detail,transfer-inbox,staff-transfers}.tsx` (actions is .ts); `mobile/src/portals/actions.ts`.
- `mobile/src/{components/staff-record-sections.tsx,operations/record-view.tsx,operations/ui.tsx,utils/staff-values.ts}`.

No Android emulator was used for this change, per request. Native swipe/keyboard/Back behavior requires the user's Expo Go test. No “always empty” claim is made beyond the source's explicit null mappings or the measured current sample.
