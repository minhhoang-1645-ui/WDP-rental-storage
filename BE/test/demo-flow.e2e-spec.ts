import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Demo Customer -> Manager -> Staff -> Customer flow', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let supportId: string | undefined;
  const password = process.env.SEED_TEST_USERS_PASSWORD ?? process.env.SEED_MANAGER_PASSWORD;

  beforeAll(async () => {
    if (!password) throw new Error('Demo seed password is not configured.');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = module.get(PrismaService);
  });

  afterAll(async () => {
    if (supportId) await prisma.supportRequest.deleteMany({ where: { id: supportId } });
    await app.close();
  });

  async function login(email: string) {
    const response = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(200);
    expect(response.body.user).not.toHaveProperty('passwordHash');
    return response.body.token as string;
  }

  it('lets each role complete the support workflow without leaking internal fields', async () => {
    const customerToken = await login('customer@test.com');
    const managerToken = await login('manager@test.com');
    const staffToken = await login('staff@test.com');
    const staffUser = await prisma.user.findUniqueOrThrow({ where: { email: 'staff@test.com' } });
    const key = `demo-e2e-${Date.now()}`;

    const created = await request(app.getHttpServer())
      .post('/api/customer/support-requests').set('Authorization', `Bearer ${customerToken}`).set('Idempotency-Key', `${key}-create`)
      .send({ reservationId: 'WDP-DEMO-ACTIVE', category: 'ACCESS_CODE_ISSUE', subject: 'Demo access assistance', description: 'Customer cannot use the current access credential.' }).expect(201);
    supportId = created.body.id;

    const managerList = await request(app.getHttpServer()).get(`/api/manager/support-requests?search=${created.body.supportCode}`)
      .set('Authorization', `Bearer ${managerToken}`).expect(200);
    expect(managerList.body.items).toHaveLength(1);

    await request(app.getHttpServer()).patch(`/api/manager/support-requests/${supportId}/assign`)
      .set('Authorization', `Bearer ${managerToken}`).set('Idempotency-Key', `${key}-assign`).send({ staffUserId: staffUser.id }).expect(200);
    await request(app.getHttpServer()).post(`/api/staff/support-requests/${supportId}/start`)
      .set('Authorization', `Bearer ${staffToken}`).set('Idempotency-Key', `${key}-start`).expect(201);
    await request(app.getHttpServer()).post(`/api/staff/support-requests/${supportId}/resolve`)
      .set('Authorization', `Bearer ${staffToken}`).set('Idempotency-Key', `${key}-resolve`)
      .send({ resolutionType: 'ACCESS_RESTORED', resolutionNote: 'Credential was revalidated and access was tested successfully.' }).expect(201);

    const customerView = await request(app.getHttpServer()).get(`/api/customer/support-requests/${supportId}`)
      .set('Authorization', `Bearer ${customerToken}`).expect(200);
    expect(customerView.body).toMatchObject({ id: supportId, status: 'RESOLVED', resolutionType: 'ACCESS_RESTORED' });
    expect(customerView.body).not.toHaveProperty('assignedStaff');
    expect(customerView.body).not.toHaveProperty('escalationReason');
    expect(customerView.body).not.toHaveProperty('passwordHash');
  });
});
