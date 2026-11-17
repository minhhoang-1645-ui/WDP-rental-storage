# Staff Service Hub implementation

## Scope and baseline

Staff only. Existing APIs, permissions, statuses, action definitions, form validation, authentication and backend unchanged. Shared components use a presentation context enabled exclusively in `app/staff/_layout.tsx`; other roles retain existing rendering. No new dependency or global theme change.

Before editing, source inspection recorded: Home contained a large intro, refresh button, ActivitySummary, repeated notification/task cards, long WorkHub descriptions and lookup links. Operations fetched four task types and offered only four shortcuts, while all nine workflow routes already existed. Staff bottom labels used shared 10sp sizing. Detail used shared generic typography and recursive record fields.

Baseline screenshots in `mobile/artifacts/staff-redesign/before/` captured a local connection error, not usable before-state UI. This is a source-based baseline visual record, not a valid native before/after comparison. After screenshots are Expo web at 390×844, using real Staff API data. Local CORS blocked the initial browser session; the isolated screenshot browser disables web security solely for this harness. Application/server CORS and auth remain unchanged. Browser screenshots do not certify native Expo Go behavior.

## Changes

- `src/app/staff/index.tsx`: compact greeting, one loaded-data work summary, six actual shortcuts, all-operations link, priority queue with expand/collapse, separate waiting-for-assignment count, pull-to-refresh and lookup links. Uses existing activity provider and ranking/authorization signals. Does not mark task notifications read merely on task navigation.
- `src/app/staff/tasks.tsx`: all nine groups, searchable Vietnamese directory with accent-insensitive lookup, supporting authorized lookup links. Operational histories remain within each group's vertical searchable list.
- `src/app/staff/_layout.tsx`: Staff-only presentation scope, compact native stack titles, existing bell and role checks retained.
- `src/app/staff/account.tsx`: readable profile label/value sizes; logout unchanged.
- `src/components/staff-ui.tsx`: navy/white shortcut grid, wrapping rows, 22/17/16/14 type scale; grid reduces columns for narrow screens or enlarged text.
- `src/components/bottom-nav.tsx`: Staff Today label, Staff-only 13sp labels, assigned-unit route parent matching; other role tab configuration unchanged.
- `src/components/page-header.tsx`: Staff-only 22sp headings.
- `src/operations/list.tsx`: Staff vertical record rows, Staff page spacing and secondary refresh; existing search/status filters, create forms, transfer inbox, maintenance guidance and API requests retained.
- `src/operations/detail.tsx`: Staff spacing only; all detail fields/actions/history/document/form sections retained.
- `src/operations/ui.tsx`: Staff-only button/body/fact/section typography and flatter panels. Other roles use previous styles.
- `scripts/staff-visual-review.cjs`: real-data read-only visual/navigation harness; password supplied via `STAFF_REVIEW_PASSWORD`, never persisted into script. No workflow mutation is submitted.

## Validation and limits

Typecheck and ESLint passed. Visual artifacts: Home, Operations, Maintenance list, Account. Route smoke opened all nine groups successfully; directory search found Bảo trì using `bao tri`; browser page errors were empty. These checks do not prove every mutation workflow, ownership rejection, keyboard behavior or screen-reader experience. Read-only route checks do not certify action completion.

Native validation deferred by user: test on Expo Go SDK 57. Check all three tabs, every shortcut, a real existing record, expanded fields, form cancel/error, enlarged text, keyboard, Android Back, bottom safe area and assigned-unit return. Use isolated test records before completing any real operational transaction. No native screenshot or native success claim is made.
