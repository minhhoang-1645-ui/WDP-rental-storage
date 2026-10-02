# WDP Self Storage

Single-facility self-storage rental platform.

## Backend account foundation

Authentication now supports `USER_STORAGE=memory` (development without a DB) or
`USER_STORAGE=prisma` (the existing Prisma User model). Sessions expire after eight
hours and can be revoked with `POST /api/auth/logout`. `GET /api/users` is restricted
to ADMIN. See [BE/README.md](BE/README.md) for setup, API details and limitations.
Booking/inquiries remain in memory in both modes; PostgreSQL integration has not
been verified against the team's existing database. No schema migration was made.

The frontend now loads products, sizes and duration choices from the backend
catalog. `GET /api/storage` filters by size/type and checks reservation overlaps
when date and duration are provided. Search results and the customer's reservation
list refresh on demand or window focus. Confirmation pages reload their records
from the API. See [FE/README.md](FE/README.md) to run both servers without PostgreSQL.

## Project structure

- `FE/`: React, TypeScript, Vite, Tailwind CSS, React Router, Lucide React and React Three Fiber.
- `BE/`: NestJS, TypeScript, PostgreSQL and Prisma.
- `screenshots/`: verified booking-wizard captures.

The public website, Size Guide, 3D viewer, storage catalog and three-step Quick Booking prototype are implemented. Staff, manager and admin areas remain route foundations.

## Start

Frontend:

```bash
cd FE
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`.

Backend:

```bash
cd BE
npm install
npm run prisma:generate
npm run start:dev
```

The API runs at `http://127.0.0.1:3000/api`. Health check: `GET /api/health`.

Prisma/PostgreSQL remain prepared for the production data layer. No Prisma schema or migration was added in this prototype. PostgreSQL is only connected at startup when `DATABASE_CONNECT_ON_STARTUP=true`.

## Quick Booking routes

- `/booking`: three-step flow, storage, period/add-ons, contact/quote/payment choice.
- `/booking/confirmation/:id`: confirmation for guest inquiry or authenticated reservation.
- `/account/login`, `/account/register`: existing account links remain available.
- `/account/reservations`: authenticated reservations only.

API:

- `GET /api/booking/catalog`
- `POST /api/booking/availability`
- `POST /api/inquiries`: guest contact inquiry, returns `PENDING_CONTACT`.
- `GET /api/inquiries/:id`
- `POST /api/reservations`: authenticated formal reservation, returns `PENDING`.
- `GET /api/reservations`
- `GET /api/reservations/:id`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`

## Verification

```bash
cd FE
npm run build
npm run lint
node scripts/booking-three-step-smoke.mjs

cd ../BE
npm run build
npm run lint
npm run test
```

The browser smoke test covers the default selection, alternate Standard/AC product, quantity and adjacency preference, short date-range pricing state, invalidating availability after a date change, restoring a current availability snapshot after refresh, empty approved-add-on state, quote rendering, disabled Pay Now, guest inquiry confirmation, image loading and mobile overflow.

## Prototype boundaries

- Dimensions, products, conditions and storage illustrations reuse the approved WDP data.
- No prices, deposit amounts, taxes, discounts, add-ons, daily rates, minimums or payment gateway are invented.
- The approved add-on catalog is currently empty, so the UI explains why no add-on cards can be selected.
- Duration choices of 1/3/6/12 months are approved. Date ranges below 28 days return `SHORT_DURATION_UNDECIDED` and remain quote-required.
- Pay Later is the only active choice. Pay Now is disabled until a verified gateway and final amount exist.
- Guest inquiries are not reservations, holds, paid orders, contracts or inventory guarantees.
- Authenticated formal reservations still require the existing bearer authentication path and are rechecked server-side.
- Reservation and inquiry records are process-memory demo records. Formal overlaps and a test-only in-memory physical-occupancy state are checked server-side, but both reset when the backend restarts; there is no Prisma-backed inventory transaction, staff check-in/check-out, renewal, cancellation or settlement workflow.
- The Prisma schema was inspected and left unchanged because production inquiry/reservation policy and approved pricing are not finalized.
- Image provenance is documented in `FE/public/images/booking/ATTRIBUTION.md`.
