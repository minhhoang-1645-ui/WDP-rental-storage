# Web → mobile functional parity audit

Audit: 2026-11-09, source inspection. All paths below are relative to repository root. API paths omit `/api`. No current-session end-to-end verification; **S** = source implementation exists, **P** = shared/generic implementation requires journey validation, **X** = current implementation conflicts with requested design scope, **U** = unresolved. S does not mean production-tested.

## Evidence map and interpretation

- Web route registry: `FE/src/app/router.tsx`; role navigation: `FE/src/components/manager/operations-navigation.ts`, `FE/src/pages/admin/AdminLayout.tsx`.
- Mobile route registry: `mobile/src/app/`; navigation: `mobile/src/components/bottom-nav.tsx`; generic detail/list/action surfaces: `mobile/src/operations/{list,detail,actions,form,mutate}.tsx` (actions is `.ts`, not `.tsx`). Dynamic `[resource]` routes must be checked against resource allowlists; file existence alone is not parity.
- Namespace mapping: `FE/src/utils/operation-access.ts`, `mobile/src/utils/operation-access.ts`, `mobile/src/services/api.ts`; effective enforcement: `BE/src/modules/auth/roles.guard.ts`.
- Domain service/controller directory in each row is backend evidence, not a guarantee every endpoint is wired on both clients. Confirm exact action suffixes in those controllers before implementation.
- Input guide: `HUONG_DAN_HIEU_VA_DEMO_NESTBOX.md`. It is historically dated and contains stale claims: mobile booking absent; unsigned renewal appendix only; Staff resolves escalation/verification; in-memory-only session assumptions. Current controller/service evidence overrides those claims. The user's requested UI scope overrides current menu exposure, without changing backend permissions.

## Customer coverage

| Workflow | Web route | Current mobile route / status | API and source evidence | Missing step or redesign verification |
|---|---|---|---|---|
| Login/logout/profile | `/account/login`, `/customer/profile` | `/login`, `/customer/account` S | `/auth/login`, `/auth/me`, `/auth/logout`; `BE/src/modules/auth/` | Real-device session expiry; preserve booking draft across profile completion. |
| Registration/recovery/claim | `/account/register`, `/claim-booking` | `/login`, `/continue-booking` P | `BE/src/modules/guest-booking/account-onboarding.controller.ts`, `guest-booking.controller.ts` | Audit each OTP/reset/claim branch and return destination; do not claim native parity from login alone. |
| Catalog/size guide | `/storage`, `/storage/:id`, `/size-guide` | `/customer/discover`, `/customer/size-finder` S | `/storage`, booking catalog; `BE/src/modules/storage/` | Compare/filter and selected-product continuity on narrow devices. |
| New booking/quote | `/booking` | `/customer/booking` S | `POST /booking/availability`, `/booking/unit-map`, `/reservations`; `mobile/src/app/customer/booking.tsx`, `BE/src/modules/booking/` | Already implemented. Improve step clarity, stale quote recovery and draft persistence, retain all options. |
| Physical position | booking wizard | `/customer/floor-plan`, booking map S | `/booking/unit-map`; booking service | Accessible list alternative, selected quantity, floor/zone, sold-out recovery. |
| Additional services | booking wizard | `/customer/booking`, `/customer/services` S/P | `/additional-services/:id/availability`; `BE/src/modules/additional-services/` | Verify purchase versus rental periods/capacity and quoted totals. |
| Reservations/detail | `/customer/reservations`, `/:id` | `/customer/reservations[/id]` P | `/reservations`; booking controllers | State/action parity for pending, confirmed, expired/cancelled; refresh after mutation. |
| Active rentals | `/customer/rentals` | matching paths S | `BE/src/modules/rentals-active/customer-active-rentals.controller.ts`; customer contracts/reservations | Overdue occupancy is not future availability. |
| Contract document/signature | `/customer/contracts` | `/customer/contracts[/id]` P | `BE/src/modules/contracts/customer-contracts.controller.ts`, documents controller | OTP, snapshot change, already signed, native PDF sharing and error recovery. |
| Invoices/payment history | `/customer/payments` | `/customer/invoices`, `/customer/payments`, dynamic financial resources S/P | `BE/src/modules/billing/customer-billing.controller.ts` | Clarify invoice versus payment; verify links don't land in inconsistent aliases. |
| Manual transfer notification | payments | financial detail P | billing payment submissions | Customer submission never marks paid; handle pending/rejected/verified. |
| VNPay/start/return/recovery | payments and VNPay return routes | payment/session services P | `BE/src/modules/billing/online-payment.controller.ts`; `mobile/src/services/online-payment-session*.ts` | Native browser return, app killed/reopened, timeout, failed payment, reconciliation state. |
| Appointment | `/customer/appointments` | `/customer/appointments[/id]` P | `BE/src/modules/appointments/customer-appointments.controller.ts` | Eligible booking, duplicate appointment and future-start activation guidance. |
| Stored items | `/customer/stored-items` | same path S | stock customer controller | Search by rental/item; quantity zero versus failure. |
| IN/OUT movements | `/customer/stock-movements[/id]` | same paths S | `BE/src/modules/stock-movements/customer-stock-movements.controller.ts` | Requested versus actual counts; no optimistic inventory mutation. |
| Renewal/appendix | `/customer/renewals` | `/customer/renewals[/id]` P | `BE/src/modules/renewals/customer-renewals.controller.ts` | Sign OTP/hash, pay activation invoice, confirm completed term and later scheduled invoices. |
| Support | `/customer/support` | `/customer/support-requests[/id]` P | `BE/src/modules/support/customer-support.controller.ts` | Category/context, response history, escalation language. |
| Transfer request/result | `/customer/transfers` | same dynamic resource P | transfer/support domain controllers/services | Follow request → operational order → result; recommendation is not completed transfer. |
| Early-return proposal | returns/rental context | rental detail/returns P | `BE/src/modules/returns/early-return-review.controller.ts`, returns service | Distinguish proposal approved from physical return completed and money refunded. |
| Return/inspection result | `/customer/returns` | `/customer/returns[/id]` P | customer returns controller/service | Blocked reason: goods remain, pending movements or unresolved renewal. |
| Deposit customer record | contextual financial records | `/customer/deposit-settlements[/id]` P | customer deposit controller | Read-only customer status retained if allowed; no Manager settlement UI in target design. |
| Notifications | `/customer/notifications` | shared ActivityBell/center P | `mobile/src/activity/`, services/live-events | Deep-link to own record, unread state independent of completion; closed-app push unverified. |

## Staff: all nine groups are mandatory

Web group routes are `/staff/<resource>[/id]`. Mobile generic groups use `/staff/[resource]/index.tsx` and `/staff/[resource]/[id].tsx` unless dedicated below. For operations, client rewrites `/manager/<resource>` to `/staff/management/<resource>`; the apparent string prefix in a shared form is not effective Manager authority.

| Group | Current implementation | API / backend evidence | Rules and remaining journey validation |
|---|---|---|---|
| 1 Reservations | S/P shared web screens, mobile actions | `/staff/management/reservations`; booking manager-reservations controller | Only pending manual exceptions; backend still checks full-period capacity/allocation. Do not add approval for auto-confirmed orders. |
| 2 Inquiries | S/P | `/staff/management/inquiries`; booking manager-inquiries controller | Contact status/notes differ from confirmed reservation. |
| 3 Support | S/P | staff support controller; `/staff/management/support-requests` | Assigned staff begins/resolves routine case; Manager resolves escalation. Validate wrong-assignee 403. |
| 4 Appointments/handover | dedicated `/staff/appointments` plus detail P | staff and manager appointments controllers | Completion and scheduled activation are separate; check report requirements and time eligibility. |
| 5 Stock movements | dedicated `/staff/stock-movements[/id]` S | staff stock controller | Assigned worker records actual quantity; stock changes only on completion; reject OUT above stock. |
| 6 Renewals | generic plus `operations/renewal-review.tsx` P | `/staff/management/renewals/:id/approve` or `/reject`; renewals service | Only PENDING; full active contracts/allocation, aligned end dates, monthly mode, no collision. No override of validations. |
| 7 Transfers | generic plus `operations/transfer-inbox.tsx` P | `/staff/management/transfers`; `/staff/transfers/:id/complete` | Same type/valid target and period; APPROVED not yet moved; validate linked customer outcome. |
| 8 Returns | generic P | returns manager/staff controllers | Staff records condition, cannot send charge/deduction decisions; all inspections/goods/movements validated. |
| 9 Maintenance | generic P | staff controller and `/staff/management/maintenance` | Available-unit manual report; assigned staff starts/submits; Manager verifies. |
| Supporting lookup | `/staff/rentals`, `/staff/assigned-units`, unit/contract context P | staff active rentals, unit-staff and lookup metadata | Not a tenth operation group; no assignment or financial decision authority. |

## Manager and Admin

| Capability | Web → mobile | Current status / API evidence | Target and remaining validation |
|---|---|---|---|
| Manager task overview | `/manager` → `/manager` | S, `operations/home.tsx` | Actionable exceptions first; distinguish money from revenue-like aggregates. |
| Assignment/reassignment | `/manager/assignments` → same | S, `operations/assignments.tsx`, unit-staff; PATCH `/manager/<resource>/:id/assign` | Support, maintenance, stock; active Staff only; validate multi-unit owner ambiguity. |
| Early return | `/manager/early-returns` → same | S, returns service decision | Manager only, financial review confirmed, stale end date/paid/outstanding snapshot rejected. |
| Escalated support | filtered operations → `/manager/support-requests` | P, POST `/manager/support-requests/:id/resolve` | Retain Manager decision, not ordinary support handling. |
| Maintenance verification | filtered operations → `/manager/maintenance` | P, POST `/manager/maintenance/:id/verify`, `/reject-verification` | Retain separate executor/verifier; guard metadata overrides generic Staff workflow. |
| Invoice/debt/record payment | operations/invoices → `/manager/invoices` | P, POST `/manager/invoices/:invoiceId/payments` | Explicit amount/method/reference; backend idempotency and balance restrictions preserved. |
| Verify/reject transfer submission | payment-submissions → same | S/P, billing controller | Verification creates Payment in transaction; rejection does not alter invoice. |
| VNPay reconciliation | matching resources | P, online payment module | Reconciliation/refund record is not automatic bank transfer. |
| Payment history | operations/payments → `/manager/payments` | P | Read recorded history; no editable payment ledger UI. |
| Deposit settlement | source sections/actions expose it | **X**; `/manager/deposit-settlements` remains in BE | Explicitly excluded from redesign UI, shortcuts, task counts and links. Backend remains untouched. Customer financial lifecycle can still require this operation: record as scope/dependency risk, do not imply auto-refund. |
| Units/catalog/services/inventory | units/catalog → facility/catalog/resources | S/P, `operations/inventory-actions.ts`, manager inventory controllers | Preserve CRUD/allowed status changes, price, service stock/capacity. |
| Customer/contracts/rental lookup | rental-records hub → same/resource routes | P | Contextual read-only operational links; no extra permissions. |
| Reports | `/manager/reports` → same | S/P, operations/reports | Discoverable under Records; date filters, correct real-received versus invoiced labels, export device handling. |
| Admin overview | `/admin` → `/admin` | S | Retain. |
| Admin accounts | `/admin/users` → list/new/detail | S/P, `/admin/users`; admin-users controller, operations/admin.tsx | Create internal Staff/Manager, status and allowed account updates; protected-account constraints remain backend-owned. |
| Admin audit/login history | web audit group and mobile tabs/routes | **X**, current `AdminLayout.tsx`, bottom-nav.tsx | Only Overview and Account Management in target. No new audit destination. Existing routes/backend not changed during design review; record exclusion explicitly. |
| Role/session shell | all roles | S/P, roles.guard.ts; mobile auth/routing | Wrong-role URL, expired session, logout clearing and no cross-role cached record leakage. |

## Priority gaps and unknowns

P0: reconcile source/UI scope differences (deposit/Admin) in review; verify each generic resource permits the intended action and no other role action. P0: full real-device booking → signature/OTP → payment → handover loop. P1: payment-return recovery, stock actual-count flow and Manager stale-decision recovery. P1: lists preserve filtering and draft forms survive refresh. P2: report sharing and large inventory ergonomics.

Unknown: production email/payment configuration; exact complete native screen parity; live network/offline behavior; keyboard and screen-reader quality; service errors on concurrent requests; audit-route treatment after design approval; operational route for settlement when excluded from this UI. None is presented as a proven defect or resolved feature. No database writes, seeds or migrations were used for this audit.
