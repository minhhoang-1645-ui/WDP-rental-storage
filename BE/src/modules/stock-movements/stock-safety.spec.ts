import 'reflect-metadata';
import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { CustomerStockMovementsController } from './customer-stock-movements.controller.js';
import { ManagerStockMovementsController } from './manager-stock-movements.controller.js';
import { OperationalStoredItemsController } from './operational-stored-items.controller.js';
import { StaffStockMovementsController } from './staff-stock-movements.controller.js';
import { StockMovementsService } from './stock-movements.service.js';

describe('Retired personal inventory HTTP routes', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        CustomerStockMovementsController, ManagerStockMovementsController,
        OperationalStoredItemsController, StaffStockMovementsController,
      ],
      providers: [{ provide: StockMovementsService, useValue: {} }],
    }).overrideGuard(AuthGuard).useValue({
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest() as AuthenticatedRequest;
        const role = req.headers.authorization?.replace('Bearer ', '') as NonNullable<AuthenticatedRequest['user']>['role'];
        if (!role) return false;
        req.user = { id: 'fixture', role, fullName: 'Fixture', email: 'fixture@example.test', phone: '' };
        return true;
      },
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  it.each([
    ['post', '/customer/stock-movements', 'STORAGE_CUSTOMER'],
    ['get', '/customer/stored-items', 'STORAGE_CUSTOMER'],
    ['get', '/customer/stock-movements', 'STORAGE_CUSTOMER'],
    ['patch', '/manager/stock-movements/legacy/assign', 'FACILITY_MANAGER'],
    ['get', '/manager/stock-movements', 'FACILITY_MANAGER'],
    ['get', '/manager/stored-items', 'FACILITY_MANAGER'],
    ['post', '/staff/stock-movements/legacy/complete', 'FACILITY_STAFF'],
    ['get', '/staff/stored-items/legacy/history', 'FACILITY_STAFF'],
    ['get', '/staff/management/stock-movements/legacy', 'FACILITY_STAFF'],
    ['patch', '/staff/management/stock-movements/legacy/assign', 'FACILITY_STAFF'],
  ] as const)('%s /api%s retires the workflow', async (method, path, role) => {
    const response = await request(app.getHttpServer())[method]('/api' + path)
      .set('Authorization', 'Bearer ' + role).expect(410);
    expect(response.body.code).toBe('PERSONAL_INVENTORY_RETIRED');
  });

  it('does not grant Staff access to Manager or Customer history', async () => {
    for (const prefix of ['manager', 'customer']) {
      await request(app.getHttpServer()).get('/api/' + prefix + '/stock-movements/legacy')
        .set('Authorization', 'Bearer FACILITY_STAFF').expect(403);
    }
  });
});
