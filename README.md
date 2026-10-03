# WDP Self Storage

Single-facility self-storage rental platform.

## Project structure

- FE/: React, TypeScript, Vite, Tailwind CSS, React Router, Lucide React and React Three Fiber.
- BE/: NestJS, TypeScript, Prisma and Supabase PostgreSQL.
- BE/prisma/migrations/20261003000100_init_persistence/: initial WDP application migration.

The public website, Size Guide, 3D viewer, storage catalog, three-step booking flow and minimum Manager inquiry portal are implemented.

## Environment

Create BE/.env from BE/.env.example and provide:

- DATABASE_URL: runtime transaction-pooler connection.
- DIRECT_URL: direct/session connection used by Prisma migrations.
- INQUIRY_LOOKUP_SECRET: at least 32 random characters.
- SEED_MANAGER_*: development-only Manager seed values.

Never commit .env. Prices that have not been approved remain null; the seed does not create invented prices.

## Database setup

~~~bash
cd BE
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
~~~

The seed is idempotent for catalog records. It creates one development facility, the six approved WDP products, 30 demo physical units and one development Manager account. Existing physical unit statuses are not overwritten on subsequent seed runs.

## Start

Backend:

~~~bash
cd BE
npm run start:dev
~~~

The API runs at http://127.0.0.1:3000/api. Health check: GET /api/health.

Frontend:

~~~bash
cd FE
npm install
npm run dev -- --host 127.0.0.1
~~~

Open http://127.0.0.1:5173.

## Routes

Customer:

- /booking: three-step booking flow.
- /booking/confirmation/:id: guest Inquiry or authenticated Reservation confirmation.
- /account/login, /account/register: Customer authentication.
- /account/reservations: the authenticated Customer's Reservations.

Manager:

- /portal/login: internal login using the shared authentication system.
- /manager/inquiries: paginated Inquiry list.
- /manager/inquiries/:id: Inquiry detail, operational status and internal note.

There is no public Manager registration.

## API

Catalog and booking:

- GET /api/booking/catalog
- POST /api/booking/availability
- GET /api/storage
- GET /api/storage/:id
- POST /api/inquiries
- GET /api/inquiries/:id with the private X-Inquiry-Access-Token
- POST /api/reservations with Customer authentication
- GET /api/reservations
- GET /api/reservations/:id

Manager:

- GET /api/manager/inquiries
- GET /api/manager/inquiries/:id
- PATCH /api/manager/inquiries/:id

Manager endpoints require MANAGER or ADMIN. Customers can read only their own Reservations. Guest Inquiry details require the lookup token returned only when the Inquiry is submitted.

## Persistence and availability

- Users, catalog, physical units, Inquiries and Reservations persist in PostgreSQL.
- Public registration always creates CUSTOMER; request bodies cannot elevate roles.
- Passwords use salted scrypt hashes and are never returned.
- Bearer sessions remain intentionally in process memory and expire after eight hours. A backend restart signs users out, but their accounts persist and can log in again.
- Availability checks the complete requested interval and quantity.
- MAINTENANCE, RESERVED and physically OCCUPIED units are unavailable.
- An OCCUPIED unit is never released because a planned end date passed.
- Only confirmed Reservation allocations block future intervals. PENDING does not assign or hold a physical unit.
- Final Inquiry and Reservation submission revalidates availability in a database transaction. It does not create a temporary hold.
- Deterministic idempotency keys prevent repeated identical submissions from creating duplicate records.

## Verification

~~~bash
cd BE
npm run lint
npm run build
npm test

cd ../FE
npm run lint
npm run build
~~~

Integration tests use the configured development database and clean up their isolated test records.

## Deferred business rules

This milestone does not implement payment, approved pricing, contracts, permanent physical-unit assignment, check-in/out, renewal, transfer, return inspection, settlement, support incidents or reporting. Inquiry is not a hold or contract. Reservation PENDING is not payment or physical allocation.
