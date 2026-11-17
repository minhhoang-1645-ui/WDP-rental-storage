# NestBox mobile redesign: review packet and milestones

2026-11-09. **Design only.** No routes, application code, permissions or business logic are changed by this packet. Companion documents: [research](UX_COMPETITOR_RESEARCH.md), [parity matrix](WEB_MOBILE_PARITY_MATRIX.md), [sitemap](MOBILE_SITEMAP.md), [design system](MOBILE_DESIGN_SYSTEM.md).

## Audit conclusions and review boundaries

Mobile already implements new booking, position selection and API calls. It uses dedicated screens plus generic resource screens; their existence is source coverage, not verified full parity. Current navigation groups many Customer functions under Services and gives Manager no bottom destination for finance/reports. Staff has nine required groups. Existing tokens are a useful foundation; tiny bottom-tab labels and dense generic forms need device review.

Current source exposes Manager deposit settlement and Admin audit/history. Target scope explicitly excludes Manager settlement UI and restricts Admin to Overview/Accounts. Record those as current-versus-target differences, not evidence backend operations disappeared. Do not add replacement financial automation or broaden Staff permissions. Backend remains authoritative for assignments, ownership, signature gates, availability, stock and state changes.

Guide conflicts: `HUONG_DAN_HIEU_VA_DEMO_NESTBOX.md` is dated and says booking is web-only, appendix signing unavailable, and Staff handles escalation/verification. Current mobile booking, renewal signature service and Manager action decorators contradict those sections. Do not use old prose as implementation truth. Sources: `mobile/src/app/customer/booking.tsx`, `BE/src/modules/renewals/renewals.service.ts`, `BE/src/modules/support/manager-support.controller.ts`, `BE/src/modules/maintenance/manager-maintenance.controller.ts`, `BE/src/modules/auth/roles.guard.ts`.

## Low-fidelity review conventions

The following text wireframes specify hierarchy and interactions, not pixel-perfect screens. Counts/amounts are placeholders, never fixture or live data. Bracketed text is an action. Main content scrolls; navigation and primary footer respect safe area/keyboard. Every screen inherits loading/empty/error/success rules from the design system.

### W01 Customer home

```text
NestBox                         [Bell] [Profile]
Xin chào, <name>
NEXT REQUIRED ACTION
<booking code> · <plain-language status>
<reason and next prerequisite>           [Continue]
MY ACTIVE STORAGE                    [View all]
<unit/type> · <term> · <contract status>
<next appointment or amount due>        [Open]
[Find storage] [IN/OUT] [Get support]
Recent booking / history link
Home | Discover | My storage | Payments | Support
```

Rationale: prerequisite-driven action precedes promotional discovery. With no records, Find storage becomes primary. With multiple records, show count and explicit identity, never assume first rental is intended. If data fails, do not render a false “no bookings” state.

### W02 Staff home

```text
Hôm nay                         [Bell] [Account]
[Mine] [Today] [In progress] [Priority]
Needs attention <count>
<task type/code>                 <due/time>
<customer> · <unit>              <status>
<allowed next action>                   [Open]
---------------------------------------------
<next assigned task row>
[All nine operation groups]
Waiting for assignment <count/link if authorized>
Today | Operations | Account
```

Rationale: assigned executable work leads, not total records across all customers. Unassigned is a separate waiting section. Backend determines which actions are executable; no completion checkbox bypasses an inspection or handover report.

### W03 Manager home

```text
Cần xử lý                       [Bell] [Profile]
[Awaiting decisions] [Unassigned]
Transfer verification <count>          [Review]
Early-return proposals <count>         [Review]
Escalated support <count>              [Review]
Maintenance verification <count>       [Review]
<exception row: identity, amount/risk, age>
Assignments needing attention          [Assign]
Received this period / Outstanding     [Finance]
Action center | Assignments | Finance | Records | Facility
```

Rationale: operational decisions first, financial aggregates secondary and explicitly labeled. Counts require full backend totals, not first-page length. No deposit settlement shortcut or task counter.

### W04 Admin home

```text
Tổng quan                            [Profile]
Accounts: <total> / active / inactive
[Manage accounts]
Account status summary → filtered account list
Overview | Account Management
```

Rationale: two real responsibilities, no invented third tab. No audit/history destination in target. Admin account management must still obey backend protected-account and role restrictions.

### W05 Customer discovery → new booking

```text
Discover: search/type filters → storage list → details
1 Details: type / quantity / start / term or end / payment plan
2 Services: optional purchases/rentals + periods + availability
3 Review: valid quote + optional position/map/list + itemization
   Due initially | total rental | deposit | services | later payments
   [Edit section]                         [Create booking]
Result: reference + confirmed/pending + hold deadline if returned
   [Review contract] → sign → invoice → pay → appointment
```

Keep currently implemented choices; step regrouping is visual only. Selected unit quantity must match booking quantity. Changing pricing inputs invalidates availability and quote before submission. Never claim availability is guaranteed until backend accepts reservation. Lost response shows Check booking, not a second new-order button. Profile completion returns to the preserved draft. No new pricing or discount rules.

### W06 Signing and payment

```text
Contract / appendix code + linked rental
Document summary / [Read PDF] / version
Signature name + pad [Clear] → request OTP → verify
Success: signed → [Open invoice]

Invoice code/status     due date
Initial/recurring/renewal purpose
Amount due / received / balance
[Itemized amounts] [Recorded payments]
[Pay with configured method]
  Manual: bank details/QR → submit notification → awaiting verification
  VNPay: external flow → return/recover → check server status
Result: exact status + reference + next allowed step
```

Rationale: signature prerequisites precede payment, and invoice/submission/payment states remain distinct. Expired OTP, changed document hash, cancelled external payment and app relaunch have recoverable states. Success requires backend result. Scheduled future invoices must not look immediately payable if service disallows payment.

### W07 Appointment and Staff handover

```text
Customer: eligible booking → slot/date → review → appointment record
Staff: appointment detail
  Customer/contact + reservation + all units + scheduled time
  Prerequisites / handover report fields / physical confirmation
  [Complete handover]
Result: handed over; Active now OR waiting for lease start
```

Rationale: appointment confirmation, physical handover and scheduled activation are separate. Use returned eligibility and current service rules; do not hardcode obsolete timing prose from guide.

### W08 IN/OUT and Staff task handling

```text
Customer: choose rental → IN/OUT → requested items/quantities → submit
Manager: unassigned movement → staff selector → assignment confirmation
Staff: assigned movement detail
  Rental/unit/customer identity
  Item                 requested    actual [input]
  <line>                 <qty>       <qty>
  Difference / required notes where applicable
  Review actual counts                 [Complete]
Result: recorded movement + resulting stock/history
```

Rationale: actual quantities cannot be confused with customer request. Wrong Staff, insufficient stock and changed task states show clear blocked reasons. Do not change inventory locally before confirmed completion. Large inventories use search and virtualized lines.

### W09 Support and maintenance

```text
Customer issue → context/category/details → request timeline
Manager assignment → Staff starts → result OR escalate
Manager escalated detail: context/evidence → decision/reason → resolve

Maintenance: report/derived case → Manager assigns
Staff starts → work notes/result → send for verification
Manager review: work result + unit/risk → verify OR return for rework
```

Rationale: preserve executor versus decision-maker separation. Transfer recommended is an outcome label with contextual link, not a completed transfer. Unit is not declared available merely because work was submitted.

### W10 Renewal and transfer

```text
Renewal: rental → additional term/plan → old/new dates + quote → submit
Automatic approval OR Staff pending review
Staff review: current contracts/allocations/collision/quote → approve/reject
Customer: appendix sign → activation invoice → completed new term

Transfer: customer request → Staff order → valid destination selection
Review source/target/type/dates → approve → physical move → complete
Customer result and linked transfer record/PDF
```

Rationale: no Staff exception override controls, arbitrary pricing or cross-type upgrade added. Approval alone cannot show either operation completed. Surface server blockers with contextual return paths.

### W11 Early return, inspection and customer outcome

```text
Customer rental → return intent
  Before end: proposal + reason → awaiting Manager decision
Manager review: end date + paid + outstanding + deposit context
  [Confirm financial review] decision + conditions/reason → submit
Customer: approved proposal → create physical return
Staff: start inspection → result for EACH unit + issue type/note
  Blockers: remaining goods / unfinished movements / unresolved renewal
  [Confirm physical return]
Customer: physical completion and financial status shown separately
```

Rationale: Manager decision checks current financial snapshot; stale review requires reload. Staff supplies observations, not charge/deduction. No Manager deposit review/refund wireframe is included. Excluding that UI leaves a backend financial dependency: obtain review acknowledgment of the product scope, never silently auto-close settlement.

### W12 Manager payment and assignment decisions

```text
Transfer submission detail
Customer + invoice + claimed amount + evidence/reference provided
Current balance + recorded transactions + submission state
[Verify actual receipt] → actual reference + review → confirmed Payment
[Reject] → required reason → customer-visible outcome

Direct receipt: invoice → amount/method/reference + required fields
Review balance and actual receipt → [Record received money]

Assignment: queue filters → task context → active Staff selector
Current assignee + proposed assignee → [Save assignment]
```

Rationale: customer claim differs from bank receipt. Backend idempotency, balance and status checks remain unchanged. Show only evidence actually collected by existing APIs; do not invent attachment upload or bank verification integration. A retry preserves request identity. Assignment is a separate authority, not a Staff self-service action.

### W13 Financial exception, facility and records

```text
Finance → VNPay reconciliation → transaction/invoice/current outcome
  Allowed resolution + reason → record
  If refund needed: real refund reference + confirmation → reconcile
Records → customer/contract/rental → documents/history
  Reports → period/filter → invoiced vs received → supported export
Facility → units / types-prices / additional services
  Detail → allowed edit → validation/review → saved record
```

Rationale: operations that record a refund do not transfer bank funds. Facility editing remains distinct from current rental status mutation; service inventory cannot fall below existing commitments. Report export uses device share/save only where implemented and authorized.

### W14 Admin account lifecycle

```text
Accounts [Search] [Role] [Status]             [Create]
<name/email> <role> <status> → detail
Create: name/email/phone/initial password/allowed internal role → review
Detail: identity + allowed account actions → reason/confirm if required
Result: saved status / inline policy error; return to same filtered list
```

Rationale: identify exact account before consequential change. Protected/current-user constraints are explained from backend errors, not bypassed. Own profile/sign-out remains a utility. No role outside Customer/Staff/Manager/Admin.

## Prioritized milestones after review

| Milestone | Scope | Acceptance evidence |
|---|---|---|
| M0 — design review | Approve sitemap, scope exclusions, wireframes, token candidates and unresolved decisions | Each parity row maps to a destination; reviewer explicitly acknowledges current deposit/Admin discrepancies. |
| M1 — foundation | Existing theme/primitives, navigation parent matching, safe areas, keyboard and shared feedback | Screens at 320/360/390dp, large text, TalkBack/VoiceOver; no role guard regression. |
| M2 — Customer booking | Discovery through reservation, signing/payment and appointment | New booking from real phone; changed quote/capacity; expired OTP; pending transfer; browser return/relaunch; matching web record. |
| M3 — Staff operations | Task home/directory and nine groups, especially stock/handover/inspection | Assigned/unassigned/wrong assignee; actual counts; blocked return; approval versus completion; no finance authority. |
| M4 — Manager | Assignment, finance, early return, escalation, maintenance verification | Stale financial snapshot, repeated submission, amount above balance, already-paid invoice, reassign inactive staff; no settlement UI links. |
| M5 — remaining parity | Catalog/services/records/reports and Admin two-destination shell | Every inventory/account action reviewed against API; scope exclusions reflected consistently; history stays reachable. |
| M6 — release readiness | Device regression, accessibility, performance and error recovery | Measured list/launch behavior on target low-memory Android and iOS; integration configuration and no unresolved P0 defects. |

No duration estimates without team capacity and device baseline. Do not run production-data integration suites to prove a design. Later tests use isolated fixtures/environment and retain record references across web/mobile.

## Open decisions and unknowns for review

1. Removing Manager settlement UI does not remove settlement backend dependencies. Which existing operational channel owns pending cases? This packet does not invent one or transfer authority.
2. Current Admin audit capabilities exceed requested target. Proposed design excludes them; whether existing routes become redirects/blocked destinations is a later approved implementation decision.
3. Public competitor evidence is regional/version-specific; contemporary native Grab/Todoist screenshots and direct interaction remain unverified.
4. Current screen-level parity, PDF/OTP/payment external return, closed-app notifications and accessibility require native device validation. Backend reachable is not end-to-end success.
5. Formative research has not occurred. Proposed home prioritization needs representative role feedback; no invented user findings.

## Design-review checklist

- Can a new Customer complete booking without opening web, and explain initial versus total price?
- Can Staff find the right assigned work and all nine groups without nine tabs?
- Can Manager distinguish assignment, verification and financial authority, with no settlement UI?
- Is Admin limited to Overview and Account Management without accidental hidden shortcut exposure?
- Are every blocked state, retry, cancelled payment and uncertain submit outcome designed?
- Are state names/actions faithful to backend, with ownership and internal notes protected?
- Are long names, Vietnamese labels, large text, keyboards and safe areas represented?
- Is every excluded or unknown capability explicit rather than silently dropped?
