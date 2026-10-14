# Staff Portal — API integration status

Staff pages use the authenticated bearer token from the shared FE API client. `STAFF`, `MANAGER` and `ADMIN` can read most operational lists; Staff-only state changes require the assigned Staff account where the BE enforces assignment.

## Connected in FE

- `GET /api/staff/appointments`: browse/filter handover appointments.
- `POST /api/staff/appointments/:id/complete-handover`: complete a confirmed physical handover with an optional note.
- `GET /api/staff/rentals`: search active rentals, unit locations, overdue rentals and future-allocation risk.
- `GET /api/staff/support-requests?assignedToMe=true`: view assigned cases.
- `POST /api/staff/support-requests/:id/start`, `/:id/resolve`, `/:id/escalate`: work, resolve or escalate an assigned support case.
- `GET /api/staff/maintenance?assignedToMe=true`: view assigned maintenance cases.
- `POST /api/staff/maintenance/:id/start`, `/:id/complete-work`: work on an assigned case and submit it for Manager verification.
- `GET /api/staff/returns`: inspect return requests.
- `POST /api/staff/returns/:id/start-inspection`, `PATCH /api/staff/returns/:returnId/inspections/:inspectionId`, `POST /api/staff/returns/:id/finalize`: record inspection results and complete the physical return.

State-changing calls use BE-supported idempotency keys where required. The BE remains authoritative for permissions, assignments, eligibility and transitions.

## APIs needed to finish operational coverage

- **Transfers:** BE currently exposes only `POST /api/staff/transfers/:id/complete`. Add `GET /api/staff/transfers` and `GET /api/staff/transfers/:id` so Staff can find an approved transfer, review source/destination and complete the right task.
- **Create maintenance:** `POST /api/staff/maintenance` exists, but requires an AVAILABLE storage unit ID. Add a Staff inventory lookup such as `GET /api/staff/storage-units?status=AVAILABLE` so the form can choose a valid unit safely.
- **Appointment details:** `GET /api/staff/appointments/:id` exists; the current list cards include the fields needed for handover, so the detail endpoint is not yet used.
