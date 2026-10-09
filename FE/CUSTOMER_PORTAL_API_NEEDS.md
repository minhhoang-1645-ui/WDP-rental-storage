# Customer Portal — API integration status

The Customer Portal sends the authenticated Customer bearer token through the shared API client.

## Integrated

- `GET /api/reservations` and `GET /api/reservations/:id`: dashboard and reservation pages.
- `GET /api/customer/rentals`: dashboard and active rentals page.
- `GET /api/customer/contracts`: contracts page and appointment eligibility.
- `GET /api/customer/invoices` and `GET /api/customer/payments`: billing page.
- `GET, POST /api/customer/appointments`: handover appointment list and request form.
- `GET, POST /api/customer/renewals`: renewal history and request form.

Appointment and renewal creation include an `Idempotency-Key`. Prices, balances, eligibility and state transitions remain controlled by the backend.

## Still needs backend API

### Storage transfer

Needed for `/customer/transfers`: list requests, validate eligible active rentals, create a request and expose its processing status.

### Customer support

Needed for `/customer/support`: list customer tickets, create a ticket and expose replies/status without putting private operational notes in the Customer response.

### Profile update

`PATCH /api/auth/me` is needed to update explicitly allowed fields such as `fullName` and `phone`. The current profile page remains read-only.

### Customer return page

The backend now exposes `GET, POST /api/customer/returns`, but the current Customer navigation has no return-storage page yet.
