import { it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AdditionalServicesService } from '../src/modules/additional-services/additional-services.service.js';
import { AdditionalServiceInventoryService } from '../src/modules/additional-services/additional-service-inventory.service.js';
import { pricedServices } from '../src/modules/additional-services/service-offerings.js';
import type { PublicUser } from '../src/modules/auth/auth.types.js';
const raw = process.env.NESTBOX_RECOVERY_DATABASE_URL ?? '',
  u = new URL(raw || 'https://invalid.test');
if (
  process.env.NESTBOX_RECOVERY_ENABLED !== '1' ||
  u.hostname !== '127.0.0.1' ||
  u.port !== '55440' ||
  u.pathname !== '/nestbox_foundation_restore' ||
  u.search ||
  process.env.DATABASE_URL !== raw ||
  process.env.DIRECT_URL !== raw
)
  throw Error('Only isolated recovery database allowed');
const db = new PrismaService();
afterAll(() => db.$disconnect());
it('preserves the ten catalog records and migrates only verified supply', async () => {
  const codes = [
    'BOX-L',
    'BOX-M',
    'BOX-S',
    'HAND-TRUCK',
    'LOCK',
    'PALLET',
    'SHELF',
    'TROLLEY',
    'WRAP',
  ];
  expect(
    await db.additionalService.count({ where: { code: { in: codes } } }),
  ).toBe(9);
  expect(
    await db.facilityServiceOffering.count({
      where: { additionalService: { code: { in: codes } } },
    }),
  ).toBe(0);
  expect(
    await db.facilityServiceOffering.count({
      where: {
        additionalService: { code: 'TAPE' },
        facility: { code: 'NESTBOX-DEMO' },
      },
    }),
  ).toBe(1);
});
it('uses one shared catalog ID, isolated prices/stock and manager permissions at two facilities; rolls back all fixtures', async () => {
  const rollback = new Error('ROLLBACK_TEST_FIXTURES');
  await expect(
    db.$transaction(
      async (tx) => {
        const token = randomUUID(),
          facilities = await Promise.all(
            ['A', 'B'].map((code) =>
              tx.facility.create({
                data: {
                  code: token + code,
                  name: 'Isolated ' + code,
                  address: 'Test only',
                  officeHours: 'Test',
                  accessHours: 'Test',
                },
              }),
            ),
          );
        const actors: PublicUser[] = [];
        for (const [i, f] of facilities.entries()) {
          const user = await tx.user.create({
            data: {
              email: token + i + '@example.test',
              passwordHash: 'NOT_A_LOGIN',
              fullName: 'Test manager',
              role: 'FACILITY_MANAGER',
            },
          });
          actors.push({ ...user, role: 'FACILITY_MANAGER', phone: '' });
          await tx.facilityAccess.create({
            data: {
              id: randomUUID(),
              userId: user.id,
              facilityId: f.id,
              activeKey: JSON.stringify([user.id, f.id]),
              grantedById: user.id,
            },
          });
        }
        // Service methods run inside this outer transaction; no real account survives.
        const scoped = Object.assign(Object.create(tx), {
          $transaction: (callback: any) => callback(tx),
        });
        const catalog = new AdditionalServicesService(scoped),
          stock = new AdditionalServiceInventoryService(scoped);
        const item = await tx.additionalService.create({
          data: {
            code: token,
            name: 'Isolated item',
            kind: 'PURCHASE',
            billingUnit: 'ONE_TIME',
            unitPrice: 999n,
          },
        });
        await tx.additionalServiceInventory.create({
          data: { additionalServiceId: item.id, stockOnHand: 777 },
        });
        await expect(catalog.managerGet(item.id, actors[0])).rejects.toThrow();
        await catalog.configure(
          item.id,
          { facilityId: facilities[0].id, unitPrice: 100, isActive: true },
          actors[0],
        );
        await catalog.configure(
          item.id,
          { facilityId: facilities[1].id, unitPrice: 200, isActive: true },
          actors[1],
        );
        await expect(
          catalog.configure(
            item.id,
            { facilityId: facilities[1].id, unitPrice: 1 },
            actors[0],
          ),
        ).rejects.toThrow();
        await expect(
          stock.publicAvailability(item.id, { quantity: 1 }),
        ).rejects.toThrow('cơ sở');
        await expect(
          stock.publicAvailability(item.id, {
            facilityId: facilities[0].id,
            quantity: 1,
          }),
        ).rejects.toThrow('tồn kho');
        await stock.update(
          item.id,
          { facilityId: facilities[0].id, stockOnHand: 3 },
          actors[0],
        );
        await stock.update(
          item.id,
          { facilityId: facilities[1].id, stockOnHand: 8 },
          actors[1],
        );
        await expect(
          stock.update(
            item.id,
            { facilityId: facilities[1].id, stockOnHand: 100 },
            actors[0],
          ),
        ).rejects.toThrow();
        expect(
          (
            await stock.publicAvailability(item.id, {
              facilityId: facilities[0].id,
              quantity: 4,
            })
          ).available,
        ).toBe(false);
        expect(
          (
            await stock.publicAvailability(item.id, {
              facilityId: facilities[1].id,
              quantity: 4,
            })
          ).available,
        ).toBe(true);
        expect(
          (await pricedServices(tx, [item.id], facilities[0].id))[0].unitPrice,
        ).toBe(100n);
        expect(
          (await pricedServices(tx, [item.id], facilities[1].id))[0].unitPrice,
        ).toBe(200n);
        expect(
          (
            await tx.additionalServiceInventory.findUniqueOrThrow({
              where: { additionalServiceId: item.id },
            })
          ).stockOnHand,
        ).toBe(777);
        expect(
          (
            await tx.additionalService.findUniqueOrThrow({
              where: { id: item.id },
            })
          ).unitPrice,
        ).toBe(999n);
        expect(
          (await catalog.managerList(actors[0])).filter(
            (row) => row.id === item.id,
          ),
        ).toHaveLength(1);
        await expect(
          catalog.update(
            item.id,
            {
              facilityId: facilities[0].id,
              name: 'Unauthorized catalog mutation',
            },
            actors[0],
          ),
        ).rejects.toThrow();
        const template = await tx.storageType.findFirstOrThrow();
        const customer = await tx.user.findFirstOrThrow({
          where: { role: 'STORAGE_CUSTOMER' },
        });
        const reservations = [];
        const types = [];
        for (const [i, f] of facilities.entries()) {
          const type = await tx.storageType.create({
            data: {
              ...template,
              id: randomUUID(),
              code: token + '-TYPE-' + i,
              facilityId: f.id,
            } as any,
          });
          types.push(type);
          reservations.push(
            await tx.reservation.create({
              data: {
                reservationCode: token + '-R-' + i,
                idempotencyKey: randomUUID(),
                customerId: customer.id,
                facilityId: f.id,
                storageTypeId: type.id,
                quantity: 1,
                startDate: new Date('2028-01-01'),
                endDate: new Date('2028-02-01'),
                periodMode: 'DURATION',
                durationMonths: 1,
                status: 'CONFIRMED',
                availabilitySnapshot: {},
                quoteSnapshot: {},
              },
            }),
          );
        }
        const row = await tx.reservationService.create({
          data: {
            reservationId: reservations[0].id,
            additionalServiceId: item.id,
            serviceCodeSnapshot: item.code,
            serviceNameSnapshot: item.name,
            serviceKindSnapshot: 'PURCHASE',
            billingUnitSnapshot: 'ONE_TIME',
            fulfillmentStatus: 'RESERVED',
            unitPriceSnapshot: 100n,
            quantity: 2,
            amountSnapshot: 200n,
          },
        });
        expect(
          (
            await stock.publicAvailability(item.id, {
              facilityId: facilities[0].id,
              quantity: 2,
            })
          ).availableQuantity,
        ).toBe(1);
        expect(
          (
            await stock.publicAvailability(item.id, {
              facilityId: facilities[1].id,
              quantity: 2,
            })
          ).availableQuantity,
        ).toBe(8);
        await expect(
          stock.update(
            item.id,
            { facilityId: facilities[0].id, stockOnHand: 1 },
            actors[0],
          ),
        ).rejects.toThrow();
        await expect(
          stock.assertQuoteAvailable(
            tx,
            [{ serviceId: item.id, quantity: 1, unitPrice: 999 }],
            types[0].id,
          ),
        ).rejects.toThrow('Giá');
        await stock.fulfillPurchases(tx, reservations[0].id);
        await stock.fulfillPurchases(tx, reservations[0].id);
        expect(
          (
            await tx.reservationService.findUniqueOrThrow({
              where: { id: row.id },
            })
          ).fulfillmentStatus,
        ).toBe('FULFILLED');
        expect(
          (
            await tx.facilityServiceOffering.findUniqueOrThrow({
              where: {
                additionalServiceId_facilityId: {
                  additionalServiceId: item.id,
                  facilityId: facilities[0].id,
                },
              },
            })
          ).stockOnHand,
        ).toBe(1);
        expect(
          (
            await tx.facilityServiceOffering.findUniqueOrThrow({
              where: {
                additionalServiceId_facilityId: {
                  additionalServiceId: item.id,
                  facilityId: facilities[1].id,
                },
              },
            })
          ).stockOnHand,
        ).toBe(8);
        const rental = await tx.additionalService.create({
          data: {
            code: token + '-RENTAL',
            name: 'Isolated rental',
            kind: 'RENTAL',
            billingUnit: 'DAY',
          },
        });
        for (const [i, f] of facilities.entries()) {
          await catalog.configure(
            rental.id,
            { facilityId: f.id, unitPrice: 300, isActive: true },
            actors[i],
          );
          await stock.update(
            rental.id,
            { facilityId: f.id, rentalCapacity: 5 },
            actors[i],
          );
        }
        await tx.reservationService.create({
          data: {
            reservationId: reservations[0].id,
            additionalServiceId: rental.id,
            serviceCodeSnapshot: rental.code,
            serviceNameSnapshot: rental.name,
            serviceKindSnapshot: 'RENTAL',
            billingUnitSnapshot: 'DAY',
            unitPriceSnapshot: 300n,
            quantity: 4,
            amountSnapshot: 1200n,
            serviceStartDate: new Date('2028-01-01'),
            serviceEndDate: new Date('2028-01-02'),
          },
        });
        expect(
          (
            await stock.publicAvailability(rental.id, {
              facilityId: facilities[0].id,
              quantity: 2,
              startDate: '2028-01-01',
              endDate: '2028-01-02',
            })
          ).available,
        ).toBe(false);
        expect(
          (
            await stock.publicAvailability(rental.id, {
              facilityId: facilities[1].id,
              quantity: 2,
              startDate: '2028-01-01',
              endDate: '2028-01-02',
            })
          ).available,
        ).toBe(true);
        await expect(
          stock.update(
            rental.id,
            { facilityId: facilities[0].id, rentalCapacity: 3 },
            actors[0],
          ),
        ).rejects.toThrow();
        await stock.update(
          rental.id,
          { facilityId: facilities[1].id, rentalCapacity: 3 },
          actors[1],
        );
        throw rollback;
      },
      { timeout: 45000 },
    ),
  ).rejects.toBe(rollback);
});
