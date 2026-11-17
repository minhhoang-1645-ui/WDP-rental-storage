# NestBox mobile design system specification

Design proposal, 2026-11-09; no token/component implementation. Extend the existing single source of truth `mobile/src/constants/wdp-theme.ts`; do not create a competing theme. Current primitives live in `mobile/src/operations/ui.tsx` and `mobile/src/components/`. Expo SDK is 57 (`mobile/package.json`); validate platform implementation against SDK 57 documentation when coding.

## Principles and visual foundation

Task first; records before decoration; readable money/status; familiar native behavior. Use grouped rows and separators for dense operational lists rather than one elevated card per field. Photos support storage discovery, not financial proof. Labels are Vietnamese-first with proper diacritics; backend enums are never primary UI copy.

| Semantic role | Proposed light value | Use |
|---|---|---|
| Primary/action | `#345786` | Existing navy; main CTA, selected state |
| Primary pressed | `#25436C` | Pressed CTA |
| On primary | `#FFFFFF` | Text/icons on primary |
| Canvas / surface / secondary | `#F2F6FD` / `#FFFFFF` / `#E5EEFC` | Existing background hierarchy |
| Primary / secondary text | `#243957` / `#566B88` | Content and supporting text |
| Decorative divider | `#CEDEF6` | Nonessential separators; not sufficient for critical control outlines |
| Control outline | `#566B88` | Visible boundaries/focus support, contrast must be measured |
| Success / container | `#237A57` / `#E7F4EC` | Backend-confirmed completion |
| Warning / container | `#855400` / `#FFF3DB` | Action needed; proposed darker warning text |
| Danger / container | `#A52F35` / `#FBECEC` | Error/destructive; proposed darker danger text |
| Information | `#306A9C` | Neutral progress/information |

These are candidates, not certified contrast results. Measure every text/background/outline pair: 4.5:1 normal text, 3:1 large text and essential non-text controls as design acceptance targets. Pale blue is not foreground text. Disabled labels remain readable and have a nearby reason when an action is blocked. Dark mode requires semantic platform surfaces and a separately measured palette before claiming support; do not invert hex values automatically.

## Type, spacing and surfaces

System font supports Vietnamese and platform text scaling. Proposed ramp: screen 28/36 semibold, section 22/30 semibold, row title 17/24 semibold, body 16/24 regular, secondary 14/20 regular, caption 12/18. Amounts use aligned numerals where supported, not a different decorative font. No 10px primary tab labels (current bottom-nav labels are 10). Keep labels short, allow wrapping and expanding row heights. Do not cap font scaling globally.

Spacing tokens: 4, 8, 12, 16, 24, 32, 48. Screen gutters 16; section separation 24; related label/help 4–8. Radius: small 8, controls 12, summary card/sheet 16, capsule only for chips. Flat page/list by default; elevation 1 for selected summary/sticky action, elevation 2 for modal surfaces. Shadows must not be the only boundary. One primary CTA per viewport task.

## Component contracts

| Component | Required variants/states | Behavior and accessibility |
|---|---|---|
| Button | Primary, secondary, text, destructive; default/pressed/focused/disabled/busy | 48dp target baseline; iOS at least 44pt; stable accessible label while busy; busy/disabled announced; no duplicate submission. |
| Text field | Text, email, phone, integer amount, multiline, secure | Persistent label, required hint, unit and inline error; preserve input; keyboard appropriate; focus first invalid field and scroll into view. |
| Select/date | Single choice/date; unavailable option | Native picker/menu or bounded sheet; large/complex choices full-screen; dates display clearly, server date semantics preserved. |
| Task row | Due, in progress, blocked, done | Identifier, task type, customer/unit, schedule, text status, next action; secondary metadata expands in detail. |
| Record row | Rental/invoice/item/account | Leading identity, two supporting lines, trailing status/amount; large text reflows trailing fields below. |
| Summary card | Booking, amount due, active rental | One meaningful group; no nested full-width buttons for every field. |
| Search | Idle/typing/results/no result/error | Visible label; clear query; retain text on failure; server-backed behavior where supported; no results is not empty dataset. |
| Filter chip | Default/selected/disabled | Selection exposed; status/date/assignee chips with active count; sheet Apply/Reset/Cancel; no silent immediate multi-filter mutation. |
| Status badge | Neutral/info/warning/success/danger | Text plus optional icon; color never sole meaning. Separate business status from network sync state. |
| Bottom sheet | Choice/filter/context options | Title, close, safe area, focus restoration, explicit Apply for staged filters; scroll long content. No long contract or financial decision crammed into sheet. |
| Timeline | Event/status transition | Actor/time/outcome; internal-only notes remain hidden from unauthorized roles. |
| Feedback | Inline/banner/snackbar/full-page | Persistent actionable error near task; snackbar for minor acknowledgment; success page only after confirmed mutation. |

Icon family: reuse existing Lucide native library consistently, 20–24 visual size inside larger targets; standard meanings, labels on tabs/actions. Do not use emoji navigation or invent new branded icons. During implementation evaluate native controls (`@expo/ui` where compatible and available) before custom equivalents; no dependency change is implied by this spec.

## Lists, forms and platform behavior

- Long collections use virtualized lists; paginated loading retains visible rows, separate footer loading/retry and end state. No nested unbounded ScrollView for thousands of tasks/items. A failed next page must not erase previous pages.
- Small width: one column. Tablets/landscape: bounded readable detail width and optional list-detail layout; no fixed-height form cards. At 200% text, important identity, amount and CTA remain reachable.
- Safe areas cover status bar, notch, home indicator and Android edge-to-edge. Sticky CTA/bottom navigation includes dynamic inset; content includes its measured occupied space. Avoid double bottom padding.
- Keyboard: focused input visible; multiline notes scroll; submit stays reachable; secure values not read aloud as text; Android Back first dismisses keyboard. Use platform-aware keyboard handling, not manual fixed pixel offsets.
- Full-page signing has document summary/version, signature input, clear/reset, OTP steps and recovery. Native sheet is appropriate for payment-method selection, not full legal document reading.
- Focus order follows reading order. Screen-reader heading structure, tab selected state, actionable row labels, currency/date speech and modal focus trapping/return are acceptance checks. Decorative images ignored; informative storage images have useful alternatives.
- Reduce motion respected. Feedback durations proposed 150–250ms; no infinite decorative motion; do not animate layout for financial values while reading.

## State and wording specification

| Situation | Required UI |
|---|---|
| Initial load | Stable skeleton matching screen structure, accessible loading label; no premature empty message. |
| Background refresh | Keep rows/draft, modest indicator; show last successful update if relevant. |
| True empty | Explain no records and offer allowed next step (Find storage/Create request); Staff empty Mine says no assigned work. |
| Filter empty | Keep filters/query, show Reset; do not suggest account has no data. |
| Read failure | Error and Retry; cached data labeled as such. |
| Validation failure | Field-specific message and summary/focus; server messages translated without losing business meaning. |
| 409/stale state | Explain changed record, refresh review, retain non-sensitive draft; never silently retry an irreversible business decision. |
| 403 | Explain no longer authorized/assigned, return to queue; no workaround CTA. |
| Payment pending | “Đang chờ xác minh”; show invoice and submission reference; no paid checkmark. |
| Confirmed mutation | Specific result and next step; “Đã gửi yêu cầu” differs from “Đã hoàn tất”. |
| Lost network during submit | Unknown outcome: refresh/check record before retry with same request identity; never declare failure means no write. |

## Business semantics that styling cannot change

Reservation confirmed ≠ contract active; signed ≠ paid; paid ≠ physically handed over; approved renewal ≠ completed term extension; approved transfer ≠ physically moved; physical return ≠ deposit settled; refund recorded ≠ money automatically transferred. No generic green badge collapses these distinctions. Staff cannot approve money deductions through inspection UI. No Manager settlement component is included in the target system.

## Sources and adoption

[Material 3](https://m3.material.io/), [Apple HIG accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Android touch targets](https://support.google.com/accessibility/android/answer/7101858), [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/). Use official guidelines as review references; JS-gated pages were not fully inspected in this desk research.

After design approval: extend existing tokens, then primitives, booking, task detail, financial review, remaining lists. Capture device screenshots and interaction checks at normal/large text, TalkBack/VoiceOver, light/dark where implemented. Existing app is not certified accessible by this document.
