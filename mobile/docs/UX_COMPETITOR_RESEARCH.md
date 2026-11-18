# NestBox mobile: competitor UX research

Research date: 2026-11-09. Design-review input; no application changes. Public documentation and publisher imagery are evidence of the described feature, not proof of every current regional app build. No authenticated competitor session or user study was performed. Proposed NestBox decisions are explicitly separate below.

## Evidence register

| ID | Public reference | Evidence and limits |
|---|---|---|
| G1 | [Grab booking](https://help.grab.com/passenger/en-sg/articles/360001392648) | Official instructions describe starting a booking from a Transport tile and destination field. SG scope. |
| G2 | [GrabExpress status](https://help.grab.com/passenger/en-th/articles/360035777332) | Activity → History → Express, Past/Ongoing, then details. Documents a distinction between a notification and the persistent booking record. TH scope. |
| G3 | [Grab advance booking](https://help.grab.com/passenger/en-ph/360001392588) | Booking information accessible through Activity/Upcoming. PH scope. |
| G4 | [Grab payment on hold](https://help.grab.com/passenger/en-th/articles/360002010168) | Holds and final charges are different; transaction history provides final charge context. |
| G5 | [Grab home evolution](https://www.grab.com/ph/better-grab-ph/) | Historical publisher description of easier pickup/service selection. Not a verified 2026 home screenshot. |
| M1 | [MoMo expense management](https://www.momo.vn/quan-ly-chi-tieu) | Official step imagery and instructions: search entry, Tôi/Utilities entry, transaction-history entry; category and period summaries. |
| M2 | [MoMo publisher step image](https://homepage.momocdn.net/img/momo-amazone-s3-api-240924150049-638627868499737997.jpg) | Actual publisher-hosted instructional image linked from M1. Review alongside source page; not a claim about the whole current home. |
| T1 | [Todoist getting started](https://www.todoist.com/help/todoist/get-started/get-started-with-todoist-OgNNJR) | Inbox captures uncategorized tasks; projects and sections organize work. |
| T2 | [Todoist filters](https://www.todoist.com/help/todoist/features/introduction-to-filters-V98wIH) | Documented query-based task subsets, including text search. Do not infer NestBox supports this query syntax. |
| S1 | [Sortly](https://www.sortly.com/) | Official inventory organization, photos, counts, alerts and history. Additional reference suited to inventory operations. |
| S2 | [Sortly actual publisher interface image](https://media.sortly.com/wp-content/uploads/2022/08/12125645/all_items_table-950x613.png) | Publisher interface image; desktop/table illustration, not a verified native mobile screen. |
| P1 | [Material 3 navigation](https://m3.material.io/components/navigation-bar/overview) | Official component reference; page was JS-gated in text retrieval. Do not attribute unobserved details to it. |
| P2 | [Apple navigation/search](https://developer.apple.com/design/human-interface-guidelines/navigation-and-search) | Official reference; JS-gated during retrieval. |
| P3 | [Android touch targets](https://support.google.com/accessibility/android/answer/7101858) | Official recommendation of at least 48dp touch targets. |
| P4 | [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | Official review reference; JS-gated during retrieval. |

Image references are links for review, not bundled assets or permission to reuse. No competitor artwork, logo or screen is reproduced in NestBox. Public screenshot evidence is currently strongest for MoMo instructional imagery and Sortly's inventory illustration. Current native Grab/Todoist screen geometry remains unverified; obtain dated iOS/Android screenshots before claiming pixel-level observations.

## Grab: booking and activity model

Verified: G1–G3 support service-first entry, a guided booking sequence, and persistent ongoing/upcoming/history records. G4 supports separating a provisional financial state from a final charge. G5 supports historical simplification of service selection, not exact contemporary layout.

| Dimension | Evidence or unknown | NestBox proposal |
|---|---|---|
| Navigation/IA | Activity is a durable booking destination, G2/G3 | Separate discovery from owned rental records. |
| Home/shortcuts | Service tile starts booking, G1 | One prominent Find storage entry; resume current booking below it. |
| Progressive disclosure | Select service before record-specific details | Reveal optional position selection after dates/availability. |
| Lists/filter/search | Past/Ongoing and service grouping, G2 | Active/history plus status/date filters; retain position after detail. |
| Multi-step flows | G1 documents booking steps | Validate dates and quote before reservation submission. |
| Tasks/notifications | G2 distinguishes notification entry from Activity record | Bell opens events; record owns next action. |
| Payments | Hold is not final charge, G4 | Submitted transfer is not Payment; show backend-confirmed result. |
| Feedback states | Current empty/error/loading visuals not verified | Distinct no availability, network failure and reservation-created states. |
| Hierarchy/accessibility | Exact screen sizes/contrast not measured | Primary next action above secondary history; use P3 targets. |

## MoMo: financial context and multiple entry points

Verified: M1 documents reaching a function through search, account utilities, or transaction history. It documents automatic categorization and weekly/monthly reports. M2 supplies publisher instructional imagery. Do not import MoMo AI classification into NestBox's scope.

| Dimension | Evidence or unknown | NestBox proposal |
|---|---|---|
| Navigation/IA | Several contextual paths to one financial function | Invoice accessible from Payments, booking and rental detail. |
| Home/shortcuts | Search and history are documented entry points | Upcoming amount and due date above payment-history shortcut. |
| Progressive disclosure | Summary/category views precede individual records | Invoice summary → itemization → recorded transactions. |
| Lists/filter/search | History entry verified; exact filters unverified | Status/date/invoice filters, explicit Reset. |
| Multi-step flow | M1 documents add-transaction steps | Confirm invoice, amount and method before external payment. |
| Tasks/notifications | Budget notifications documented; task model not verified | Payment reminder links to invoice without implying settlement. |
| Payments | Public expense history is distinct from input flow | Show due, received and balance separately; reference and time on receipt. |
| Feedback states | Full current error/success set not verified | Pending verification remains pending after customer submission. |
| Hierarchy/accessibility | No contrast audit performed | Large amount plus text status; no status communicated by color alone. |

## Todoist: operational focus

Verified: T1 supports Inbox, projects and sections; T2 supports focused query/filter views. This is an organizational reference, not evidence of NestBox assignment semantics.

| Dimension | Evidence or unknown | NestBox proposal |
|---|---|---|
| Navigation/IA | Capture and organization are separate, T1 | Staff Today queue and nine-group Operations directory are separate. |
| Home/shortcuts | Task-centric model verified; precise home arrangement unknown | Assigned actionable work first; counts link to filtered lists. |
| Progressive disclosure | Projects/sections organize larger task sets | Show next action, then expand customer/contract context. |
| Lists/filter/search | Filter queries documented, T2 | Simple chips: Mine, Today, Priority, Status; no query-language UI. |
| Complex workflows | Personal task completion is not operational approval | NestBox completion requires the backend-specific checklist. |
| Tasks/notifications | Inbox is task capture, not proof of notification center behavior | Notifications never count as work completion. |
| Payments | Not an applicable payment reference | Use invoice-specific design instead. |
| Feedback states | Native visuals not verified | Empty Mine differs from empty filtered result; preserve stale list on refresh failure. |
| Hierarchy/accessibility | No measurement performed | Scannable rows, wrapping titles, accessible selected-filter state. |

## Sortly: inventory identity

Verified: S1 supports folders by location/type, item photos, counting and history. S2 illustrates a structured inventory table; mobile layout is not inferred from desktop imagery.

| Dimension | Evidence or unknown | NestBox proposal |
|---|---|---|
| Navigation/IA | Location/type organization, S1 | Rental/unit context → stored items → movement history. |
| Home/shortcuts | Exact native home not verified | Staff entry goes to assigned movement rather than whole inventory. |
| Progressive disclosure | Structured item details, S1 | Row shows identity/unit/quantity; full history on detail. |
| Lists/filter/search | Organization verified; current filter UI unknown | Search item name/code; filter contract and movement direction. |
| Multi-step work | Counts/scanning documented, S1 | Requested quantity and actual count separate; no new scanner feature proposed. |
| Tasks/notifications | Alerts exist, S1 | Inventory changes are events; assigned movements are tasks. |
| Payments | Not applicable | Do not borrow inventory totals as financial totals. |
| Feedback states | Full native state set unknown | Zero stock is valid data; unavailable data is an error. |
| Hierarchy/accessibility | Photos aid identity; measurements unknown | Text identity remains available without image/color. |

## Synthesis and research gaps

Adopt service-first discovery, contextual record links, focused work queues and explicit financial states. Avoid superapp promotional density, nine operational tabs, desktop inventory tables squeezed onto phones, or a generic checkmark for consequential business completion.

This is desk research, not validated user research. Review hypotheses with 2–3 participants per role: Customer finds price and completes booking; Staff finds assigned work and records counts; Manager distinguishes transfer proof from received funds and decides an early return; Admin finds and changes the intended account. Record first-click success, completion, backtracking, misunderstood status and inaccessible controls. Sample is formative, not statistically representative. Do not invent baseline performance or numerical improvement claims.
