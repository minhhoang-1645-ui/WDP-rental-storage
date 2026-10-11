# Customer Portal — API integration status

The Customer Portal sends the authenticated Customer bearer token through the shared API client.

## Integrated

- `GET /api/reservations` and `GET /api/reservations/:id`: dashboard and reservation pages.
- `GET /api/customer/rentals`: dashboard and active rentals page.
- `GET /api/customer/contracts`: contracts page and appointment eligibility.
- `GET /api/customer/invoices` and `GET /api/customer/payments`: billing page.
- `GET, POST /api/customer/appointments`: handover appointment list and request form.
- `GET, POST /api/customer/renewals`: renewal history and request form.
- `GET, POST /api/customer/support-requests`: support request list and request form.
- `GET, POST /api/customer/returns`: return request list and request form.
- `GET /api/customer/deposit-settlements`: customer-visible deposit settlement details.

Appointment, renewal, support and return creation include an `Idempotency-Key`. Prices, balances, eligibility and state transitions remain controlled by the backend.

## Still needs backend API

### Storage transfer visibility

Customer starts this workflow through `/api/customer/support-requests`. Only Manager/Staff transfer endpoints currently exist, so `/customer/transfers` shows the related support request and WDP decision; it cannot display the internal TransferRequest record directly.

### Profile update

`PATCH /api/auth/me` is needed to update explicitly allowed fields such as `fullName` and `phone`. The current profile page remains read-only.
