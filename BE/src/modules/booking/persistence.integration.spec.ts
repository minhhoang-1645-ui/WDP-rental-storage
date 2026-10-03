import 'dotenv/config';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PrismaUserRepository } from '../users/user.repository.js';
import { BookingService } from './booking.service.js';
import { ManagerInquiriesController } from './manager-inquiries.controller.js';

const futureDate = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 90);
  return date.toISOString().slice(0, 10);
};

describe('Persistence and manager milestone', () => {
  let prisma: PrismaService;
  const createdUserIds: string[] = [];
  const createdInquiryIds: string[] = [];
  const createdReservationIds: string[] = [];

  beforeAll(async () => {
    process.env.INQUIRY_LOOKUP_SECRET ??= 'test-inquiry-secret-that-is-at-least-32-characters';
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.reservation.deleteMany({ where: { id: { in: createdReservationIds } } });
    await prisma.contactInquiry.deleteMany({ where: { id: { in: createdInquiryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('persists CUSTOMER registration, hashes password and rejects duplicate email', async () => {
    const repository = new PrismaUserRepository(prisma);
    const auth = new AuthService(repository);
    const email = `persist-${randomUUID()}@example.test`;
    const input = { fullName: 'Persistent Customer', email, phone: '0900000003', password: 'strong-test-password', role: 'ADMIN' };
    const session = await auth.register(input);
    createdUserIds.push(session.user.id);
    expect(session.user.role).toBe('CUSTOMER');
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(stored.passwordHash).not.toContain(input.password);
    await expect(auth.register(input)).rejects.toThrow('Email này đã được đăng ký.');
  });

  it('authenticates a persisted user through a new AuthService instance', async () => {
    const repository = new PrismaUserRepository(prisma);
    const first = new AuthService(repository);
    const email = `restart-${randomUUID()}@example.test`;
    const input = { fullName: 'Restart Customer', email, phone: '0900000004', password: 'strong-restart-password' };
    const registered = await first.register(input);
    createdUserIds.push(registered.user.id);
    const restarted = new AuthService(new PrismaUserRepository(prisma));
    expect((await restarted.login(input)).user.id).toBe(registered.user.id);
  });

  it('persists an inquiry and lets a new service instance read it with its lookup token', async () => {
    const first = new BookingService(prisma);
    const email = `restart-inquiry-${randomUUID()}@example.test`;
    const inquiry = await first.createInquiry({ productId: 'lk-a01', startDate: futureDate(), periodMode: 'duration', durationMonths: 1, quantity: 1, adjacencyPreference: false, addonIds: [], paymentChoice: 'pay-later', fullName: 'Restart Guest', phone: '0900000005', email });
    const stored = await prisma.contactInquiry.findUniqueOrThrow({ where: { inquiryCode: inquiry.id } });
    createdInquiryIds.push(stored.id);
    const restarted = new BookingService(prisma);
    expect((await restarted.getInquiry(inquiry.id, inquiry.accessToken)).id).toBe(inquiry.id);
  });

  it('allows MANAGER to list, view and update the same persisted inquiry', async () => {
    const manager = await prisma.user.findFirstOrThrow({ where: { role: 'MANAGER' } });
    const service = new BookingService(prisma);
    const email = `manager-flow-${randomUUID()}@example.test`;
    const inquiry = await service.createInquiry({ productId: 'md-d04', startDate: futureDate(), periodMode: 'duration', durationMonths: 3, quantity: 1, adjacencyPreference: false, addonIds: [], paymentChoice: 'pay-later', fullName: 'Manager Flow Guest', phone: '0900000006', email });
    const stored = await prisma.contactInquiry.findUniqueOrThrow({ where: { inquiryCode: inquiry.id } });
    createdInquiryIds.push(stored.id);
    expect((await service.listManagerInquiries(1, 100)).items.some((item) => item.id === inquiry.id)).toBe(true);
    expect((await service.getManagerInquiry(inquiry.id)).customer.email).toBe(email);
    const updated = await service.updateManagerInquiry(inquiry.id, { status: 'CONTACTED', internalNotes: 'Đã gọi xác nhận nhu cầu.' }, { id: manager.id, fullName: manager.fullName, email: manager.email, phone: manager.phone ?? '', role: manager.role });
    expect(updated.status).toBe('CONTACTED');
    expect(updated.internalNotes).toContain('Đã gọi');
  });

  it('blocks a CUSTOMER from Manager inquiry controllers through RolesGuard', () => {
    const guard = new RolesGuard(new Reflector());
    const context = {
      getHandler: () => function managerInquiryList() {},
      getClass: () => ManagerInquiriesController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role: 'CUSTOMER' } }) }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
