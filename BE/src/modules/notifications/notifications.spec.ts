import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { PublicUser } from '../auth/auth.types.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationSources } from './notification-sources.js';
import { buildNotices, type NotificationData } from './notification-content.js';

const actor = (id: string, role: PublicUser['role']): PublicUser => ({ id, role, fullName: id, email: id + '@example.test', phone: '' });
const staff = actor('staff-a', 'STAFF');
const customer = actor('customer-a', 'CUSTOMER');
const other = actor('customer-b', 'CUSTOMER');
const manager = actor('manager', 'MANAGER');
const admin = actor('admin', 'ADMIN');
const accounts = [staff, customer, other, manager, admin];
const at = '2026-11-18T10:00:00Z';
const work = { id: 'meeting', status: 'CONFIRMED', assignedStaff: staff, appointmentCode: 'TECH-SECRET', createdAt: at, allocatedUnits: [{ unitCode: 'B12' }] };
const userEvent = { id: 'notice-1', action: 'DISABLE_ACCOUNT', resource: 'users', resourceId: 'account-abc', outcome: 'SUCCESS', targetAccount: { fullName: 'Minh Anh', role: 'CUSTOMER' }, createdAt: at };

it('does not surface bookings to Staff or reset a handover receipt on per-unit progress', () => {
  const baseline = buildNotices(staff, { appointments: [work] });
  const progressed = buildNotices(staff, {
    reservations: [{ id: 'pending-booking', status: 'PENDING', assignedStaff: staff, createdAt: at }],
    appointments: [{ ...work, activityUpdatedAt: at, updatedAt: '2026-11-18T11:00:00Z' }, { ...work, id: 'legacy-blocked', bookingReady: false }],
  });
  expect(progressed.map(item => item.token)).toEqual(baseline.map(item => item.token));
  expect(progressed).toHaveLength(1);
  expect(buildNotices(staff, { appointments: [{ ...work, status: 'COMPLETED', completedAt: '2026-11-18T12:00:00Z' }] })[0].token).not.toBe(baseline[0].token);
});

describe('notification HTTP API', () => {
  let app: INestApplication;
  let receipts: Map<string, Set<string>>;
  let data: Record<string, NotificationData>;

  beforeEach(async () => {
    receipts = new Map();
    const inbox = (id: string, name: string) => Array.from({ length: 131 }, (_, index) => ({
      id: `${id}-${index}`, status: 'RESOLVED', supportCode: `SUP-${index}`,
      customerId: id, storageType: { name }, createdAt: new Date(Date.parse(at) - index * 60000).toISOString(),
    }));
    data = {
      [customer.id]: { 'support-requests': inbox(customer.id, 'Kho nhỏ'), invoices: [
        { id: 'invoice-1', status: 'OPEN', balanceDue: 100, customerId: customer.id, createdAt: at, type: 'RECURRING', signing: { complete: true } },
        { id: 'invoice-private', status: 'OPEN', balanceDue: 100, customerId: other.id, createdAt: at },
      ] },
      [other.id]: { 'support-requests': inbox(other.id, 'Kho riêng') },
      [staff.id]: { appointments: [{ ...work }, { ...work, id: 'unassigned', assignedStaff: null }, { ...work, id: 'other-assigned', assignedStaff: { id: 'staff-b' } }, { ...work, id: 'done', status: 'COMPLETED' }] },
      [manager.id]: { appointments: [{ ...work, assignedStaff: null }, { ...work, id: 'owned', assignedStaff: staff }], maintenance: [
        { id: 'verify', status: 'AWAITING_VERIFICATION', assignedStaff: staff, createdAt: at },
        { id: 'finished', status: 'COMPLETED', assignedStaff: staff, createdAt: at },
      ] },
      [admin.id]: { users: [userEvent, userEvent, { ...userEvent, id: 'login', action: 'AUTH_LOGIN', resource: 'auth' }, { ...userEvent, id: 'ordinary', resource: 'contracts' }] },
    };
    const module = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        NotificationsService, AuthGuard, RolesGuard,
        { provide: AuthService, useValue: { getUserByToken: (token: string) => accounts.find(user => user.id === token) } },
        { provide: NotificationSources, useValue: { load: (user: PublicUser) => Promise.resolve(data[user.id]) } },
        { provide: PrismaService, useValue: { notificationReceipt: {
          findMany: ({ where }: { where: { userId: string; token: { in: string[] } } }) =>
            where.token.in.filter(token => receipts.get(where.userId)?.has(token)).map(token => ({ token })),
          createMany: ({ data }: { data: { userId: string; token: string }[] }) => {
            let count = 0;
            for (const { userId, token } of data) {
              const user = receipts.get(userId) ?? new Set<string>();
              if (!user.has(token)) count++;
              user.add(token);
              receipts.set(userId, user);
            }
            return { count };
          },
        } } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterEach(async () => app.close());

  const get = (user: PublicUser, query = '') => request(app.getHttpServer()).get('/notifications' + query).set('Authorization', 'Bearer ' + user.id);
  const patch = (user: PublicUser, path: string) => request(app.getHttpServer()).patch('/notifications/' + path).set('Authorization', 'Bearer ' + user.id);
  const open = (user: PublicUser, token: string) => request(app.getHttpServer()).post('/notifications/' + token + '/open').set('Authorization', 'Bearer ' + user.id);

  it('uses complete totals and deterministic server pages with filters and five recent entries', async () => {
    const seen = new Set<string>();
    for (let page = 1; page <= 7; page++) {
      const response = await get(customer, `?limit=20&page=${page}&kind=support-requests&search=kho%20nho`).expect(200);
      expect(response.body.total).toBe(131);
      expect(response.body.unreadTotal).toBe(132);
      expect(response.body.recent).toHaveLength(5);
      expect(response.body.items.length).toBe(page < 7 ? 20 : 11);
      for (const item of response.body.items) {
        expect(seen.has(item.token)).toBe(false);
        expect(item).not.toHaveProperty('target');
        expect(item).not.toHaveProperty('code');
        seen.add(item.token);
      }
    }
    expect(seen.size).toBe(131);
    expect((await get(customer, '?limit=50&page=999').expect(200)).body.page).toBe(3);
    await get(customer, '?limit=100').expect(400);
    await request(app.getHttpServer()).get('/notifications').expect(401);
  });

  it('keeps read and action separate, isolates accounts, and persists idempotently', async () => {
    const first = (await get(customer, '?view=action').expect(200)).body.items[0];
    expect(first.actionLabel).toBe('Thanh toán hóa đơn');
    await patch(other, first.token + '/read').expect(404);
    await open(other, first.token).expect(404);
    await Promise.all([patch(customer, first.token + '/read').expect(200), patch(customer, first.token + '/read').expect(200)]);
    expect(receipts.get(customer.id)?.size).toBe(1);
    const action = (await get(customer, '?view=action').expect(200)).body;
    expect(action.items[0].unread).toBe(false);
    expect(action.total).toBe(1);
    expect((await patch(customer, 'read-all').expect(200)).body.updated).toBe(131);
    expect((await get(customer, '?view=unread').expect(200)).body.total).toBe(0);
    expect((await get(other, '?view=unread').expect(200)).body.unreadTotal).toBe(131);
    expect((await open(customer, first.token).expect(200)).body.target).toBe('/customer/payments?invoice=invoice-1');
  });

  it('admits only assigned Staff work, blocks stale links and recognizes newly assigned work', async () => {
    const all = (await get(staff).expect(200)).body;
    expect(all.total).toBe(2);
    const action = (await get(staff, '?view=action').expect(200)).body;
    expect(action.total).toBe(1);
    const token = action.items[0].token;
    expect((await open(staff, token).expect(200)).body.target).toBe('/staff/appointments/meeting');
    data[staff.id].appointments[0].assignedStaff = { id: 'staff-other' };
    await open(staff, token).expect(404);
    data[staff.id].appointments[1].assignedStaff = staff;
    expect((await get(staff, '?view=action').expect(200)).body.total).toBe(1);
  });

  it('limits Manager actions and Admin account events to their workflow', async () => {
    const management = (await get(manager, '?view=action').expect(200)).body.items;
    expect(management.map((item: { actionLabel: string }) => item.actionLabel)).toEqual(['Phân công nhân viên', 'Nghiệm thu bảo trì']);
    expect((await open(manager, management[0].token).expect(200)).body.target).toBe('/manager/assignments?kind=appointments&record=meeting');
    const events = (await get(admin).expect(200)).body;
    expect(events.total).toBe(1);
    expect(events.items[0].title).toBe('Đã vô hiệu hóa tài khoản');
    expect((await open(admin, events.items[0].token).expect(200)).body.target).toBe('/admin/users/account-abc');
    expect((await get(admin, '?view=action').expect(200)).body.total).toBe(0);
  });
});

it('does not turn a closed payment window or a future installment into an action', () => {
  const notices = buildNotices(customer, { invoices: [
    { id: 'late', type: 'INITIAL', status: 'OPEN', balanceDue: 10, createdAt: at, reservation: { expiresAt: at } },
    { id: 'future', type: 'RENEWAL', renewalCycle: 2, status: 'OPEN', balanceDue: 10, dueAt: '2030-01-01T00:00:00Z', createdAt: at },
  ] }, Date.parse(at) + 1);
  expect(notices.map(row => row.actionLabel)).toEqual(['', '']);
});

it('treats an early-return approval as actionable only for the current rental term', () => {
  const reservation = { id: 'rental-1' };
  const support = { id: 'approval-1', subject: 'Đề nghị trả kho trước hạn', status: 'RESOLVED',
    createdAt: at, reservation, earlyReturnDecision: 'APPROVED', earlyReturnForEndDate: '2027-01-10' };
  const active = { id: 'contract-1', status: 'ACTIVE', reservation, endDate: '2027-01-10', createdAt: at };
  const build = (contract: typeof active, renewals: NotificationData['renewals'] = []) =>
    buildNotices(customer, { 'support-requests': [support], contracts: [contract], renewals }).find(row => row.kind === 'early-returns');
  expect(build(active)?.actionLabel).toBe('Xem điều kiện trả kho');
  expect(build({ ...active, endDate: '2027-02-10' })?.actionLabel).toBe('');
  expect(build(active, [{ status: 'PENDING', reservation }])?.actionLabel).toBe('');
});

it('walks every upstream page and uses the authenticated actor in the Staff lookup', async () => {
  const page = { items: [], total: 0, limit: 100 };
  const list = vi.fn(async (input: { page: number; limit: number }) => ({
    items: input.page === 1 ? [{ id: 'first' }] : [{ id: 'second' }], total: 101, limit: 100,
  }));
  const stock = { listStaff: vi.fn().mockResolvedValue(page) };
  const sources = new NotificationSources(
    { listOperationalAppointments: list } as never, {} as never, {} as never, {} as never, {} as never,
    { list: vi.fn().mockResolvedValue(page) } as never, {} as never,
    { listStaff: vi.fn().mockResolvedValue(page) } as never, {} as never,
    { listStaffReturns: vi.fn().mockResolvedValue(page) } as never, stock as never,
    { listStaff: vi.fn().mockResolvedValue(page) } as never,
    { listForStaff: vi.fn().mockResolvedValue(page) } as never,
  );
  expect((await sources.load(staff)).appointments).toEqual([{ id: 'first' }, { id: 'second' }]);
  expect(list).toHaveBeenLastCalledWith({ page: 2, limit: 100 }, staff);
  expect(stock.listStaff).toHaveBeenCalledWith(staff, { page: 1, limit: 100 });
});
