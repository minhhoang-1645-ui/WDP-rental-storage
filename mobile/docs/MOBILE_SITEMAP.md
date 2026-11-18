# Proposed mobile information architecture

Design proposal, 2026-11-09. This is a navigation contract, not a route migration. Existing Expo paths remain evidence/implementation anchors until review approval. Four roles only. Notification bell and profile utility are header actions, not obligatory bottom tabs.

## Customer: five destinations

```text
Trang chủ / Home                         existing /customer
  Next required action → relevant record (sign/pay/book handover)
  Active rental summary / latest booking / notifications bell / profile utility
Tìm kho / Discover                       /customer/discover
  Type list → type details → size finder / floor-plan list alternative
  Booking                                 /customer/booking
    Dates + quantity + payment plan → services → availability/position → review
    Reservation result → contract/sign OTP → invoice → payment result
Kho của tôi / My storage                 /customer/rentals
  Active rentals → rental detail
    Contract/PDF/signature
    Stored items → IN/OUT → movement detail/history
    Appointment / renewal + appendix / transfer / return
  Reservations → reservation detail
  Booking history → historic rental/contract/transfer records
Thanh toán / Payments                    /customer/invoices (existing entry)
  Due / awaiting verification / recorded history
  Invoice detail → sign prerequisite / payment method / transfer submission
  VNPay return/recovery → invoice and recorded payment
  Customer deposit record (read-only if currently authorized)
Hỗ trợ / Support                         existing services/support resources
  Support list → create contextual request → response timeline
  Services directory → additional service records / appointment shortcuts
```

Account/profile/sign-out reachable from avatar from every root; they are utility functions, not a sixth destination. Moving current Services functions into My storage/Support must retain contextual and directory entry paths. New users see Find storage; renters see next required action first. History is durable, never hidden when rental ends.

## Staff: three destinations

```text
Hôm nay / Today                          /staff
  Mine / due today / in progress / blocked
  Task → identity + prerequisites → allowed action → checklist/result
  Notifications bell (events, not tasks)
Vận hành / Operations                    /staff/tasks
  Tiếp nhận: Reservations | Inquiries | Support
  Giao nhận: Appointments | Stock movements
  Thay đổi thuê: Renewals | Transfers | Returns
  Cơ sở: Maintenance
  Supporting lookups: Assigned units | Rentals | Contracts/units as authorized
Tài khoản / Account                      /staff/account
  Own contact / session / sign out
```

All nine groups remain independently discoverable. Group directory is not nine tabs. Task detail is shared identity/status scaffolding with domain-specific evidence and actions. Unassigned work is visibly waiting for Manager assignment, never mislabeled as the current Staff's executable task. An existing non-assigned workflow must not gain an assignment requirement merely from visual grouping.

## Manager: five destinations

```text
Cần xử lý / Action center                /manager
  Payment verifications / early returns / escalated support / maintenance verification
  Unassigned or unavailable assignee → assignment
  Contextual exception detail with reasons and audit timeline
Phân công / Assignments                  /manager/assignments
  Unassigned / assigned / needs reassignment
  Support | maintenance | stock movement | unit responsibility
Tài chính / Finance                      /manager/finance
  Invoices & debt → record received payment
  Transfer submissions → verify/reject
  VNPay reconciliation → resolution / refund recording
  Recorded payment history
Hồ sơ / Records                          /manager/rental-records
  Customers | Contracts | Rentals | Reports (/manager/reports)
Cơ sở / Facility                         /manager/facility
  Physical units | Catalog/prices | Additional services/inventory
```

Reviews/approvals existing routes become contextual children of Action center; retain early-return deep links. Account through header utility. No Manager deposit settlement destination, action, empty state, notification deep link, financial shortcut or badge is proposed. Existing backend remains unchanged. A return awaiting that excluded backend operation must not be falsely presented as financially completed.

## Admin: two destinations

```text
Tổng quan / Overview                     /admin
  Account totals/state summary → relevant account filter
Quản lý tài khoản / Accounts             /admin/users
  Search/filter → detail → allowed account/status actions
  Create internal account                /admin/users/new
  Own account/sign out: header utility within this shell
```

Two destinations are intentional; adding tabs to reach three would create unnecessary categories. Current login-history/activity routes are scope conflicts, not proposed third/fourth destinations. Account editing does not imply permission to elevate any role arbitrarily.

## Cross-role navigation rules

- Each deep link resolves auth → role → ownership → resource. On expiry retain safe intent, require login, then recheck authorization; never display previous role's cached detail.
- Detail opened from queue returns to same search/filter/scroll. Detail opened from notification returns to notification context or authorized role root.
- Tab selection represents the parent domain for every nested route. No detail should leave all tabs unselected (current Manager finance/reports matching needs review).
- Preserve draft on recoverable error and background refresh; switching context with unsaved data prompts only when actual loss is possible.
- Booking, signing, inspection and financial review use full-screen steps; sheets are for bounded choices/filtering. Android Back dismisses keyboard, then sheet, then navigation level; leaving a submitted request must not resubmit it.
- List filters supported by the API are authoritative. Do not show a global count based on one loaded page or create unsupported server search semantics.
- Notifications indicate events/unread. Task queues show actionable records. Reading an event never completes the task.

## Review coverage

Every parity-matrix row has a destination or explicit scope exclusion. Review discovery with new Customer, returning renter, busy Staff, Manager with pending finance and Admin managing accounts. Verify at 320/360/390dp widths and large text before implementing tab structure. Proposed routes may be aliases to current nested paths; do not restructure existing source solely to match this diagram.
