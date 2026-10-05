# Customer Portal — Backend APIs needed

The Customer Portal uses the existing `GET /api/reservations` and `GET /api/reservations/:id` APIs. The modules below deliberately show an empty state because no API contract exists for them yet.

## NEED BACKEND API

Method: `GET`

Route: `/api/customer/rentals`

Purpose: Show storage units and rentals currently active for the authenticated customer.

Expected request: Authenticated customer bearer token.

Expected response: Rental reference, reservation/contract reference, storage type, assigned unit when approved, start/end dates, rental status.

UI blocked: `/customer/rentals` dashboard active-rental information.

## NEED BACKEND API

Method: `GET`

Route: `/api/customer/contracts`

Purpose: List contracts belonging to the authenticated customer.

Expected request: Authenticated customer bearer token.

Expected response: Contract reference, rental reference, status, signed date, document availability.

UI blocked: `/customer/contracts`.

## NEED BACKEND API

Method: `GET`

Route: `/api/customer/payments`

Purpose: List approved invoices and payment state without inventing charges or amounts.

Expected request: Authenticated customer bearer token.

Expected response: Invoice reference, approved amount/currency, due date, payment status, payment URL only when valid.

UI blocked: `/customer/payments` and payment action in reservation detail.

## NEED BACKEND API

Method: `GET`

Route: `/api/customer/appointments`

Purpose: List upcoming and past appointments for the authenticated customer.

Expected request: Authenticated customer bearer token.

Expected response: Appointment reference, date/time, purpose, facility, status, available customer actions.

UI blocked: `/customer/appointments` and dashboard appointment information.

## NEED BACKEND API

Method: `GET, POST`

Route: `/api/customer/renewals`, `/api/customer/transfers`, `/api/customer/support`

Purpose: List and create customer requests for renewal, transfer, and support.

Expected request: Authenticated customer bearer token; create requests must define server-side validation and permitted state transitions.

Expected response: Request reference, relevant rental/reservation reference, status, created/updated dates, validated request fields.

UI blocked: `/customer/renewals`, `/customer/transfers`, `/customer/support`.

## NEED BACKEND API

Method: `PATCH`

Route: `/api/auth/me`

Purpose: Update the authenticated customer's name and phone.

Expected request: Authenticated customer bearer token and explicitly allowed fields.

Expected response: Updated public user profile.

UI blocked: Editing `/customer/profile`.
