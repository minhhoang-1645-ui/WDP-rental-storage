import 'reflect-metadata';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';

process.env.USER_STORAGE = 'memory';
process.env.DATABASE_CONNECT_ON_STARTUP = 'false';
process.env.NODE_ENV = 'test';
const { AppModule } = await import('../dist/app.module.js');
const { UserRepository } = await import('../dist/modules/users/user.repository.js');
const app = await NestFactory.create(AppModule, { logger: false });
app.setGlobalPrefix('api');
try {
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const call = async (path, method = 'GET', body, token) => {
    const response = await fetch(url + '/api' + path, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  const input = { fullName: 'Test Customer', email: 'smoke@example.com', phone: '0901234567', password: 'test-password-123', role: 'ADMIN' };
  const registered = await call('/auth/register', 'POST', input);
  assert.equal(registered.status, 201);
  assert.equal(registered.body.user.role, 'CUSTOMER');
  const token = registered.body.token;
  assert.equal((await call('/auth/me', 'GET', undefined, token)).status, 200);
  assert.equal((await call('/users')).status, 401);
  assert.equal((await call('/users', 'GET', undefined, token)).status, 403);
  const repository = app.get(UserRepository);
  const customer = await repository.findByEmail(input.email);
  await repository.create({ ...customer, email: 'admin@example.com', role: 'ADMIN' });
  const admin = await call('/auth/login', 'POST', { email: 'admin@example.com', password: input.password });
  assert.equal(admin.status, 200);
  const users = await call('/users', 'GET', undefined, admin.body.token);
  assert.equal(users.status, 200);
  assert.equal(users.body.items.length, 2);
  assert.ok(users.body.items.every(user => !('passwordHash' in user)));
  assert.equal((await call('/users?page=0', 'GET', undefined, admin.body.token)).status, 400);
  const date = new Date(); date.setUTCDate(date.getUTCDate() + 30);
  const draft = { productId: 'sm-b12', startDate: date.toISOString().slice(0, 10), periodMode: 'duration', durationMonths: 1, quantity: 1, addonIds: [], paymentChoice: 'pay-later' };
  const catalog = await call('/booking/catalog');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.sizes.length, 4);
  assert.ok(catalog.body.products.every(item => typeof item.image === 'string' && Array.isArray(item.features)));
  const search = '/storage?size=small&type=standard&duration=1&date=' + draft.startDate;
  assert.equal((await call(search)).body.total, 1);
  assert.equal((await call('/storage/does-not-exist')).status, 404);
  assert.equal((await call('/storage?date=2099-02-30')).status, 400);
  const reserved = await call('/reservations', 'POST', draft, token);
  assert.equal(reserved.status, 201);
  assert.equal((await call(search)).body.total, 0);
  assert.equal((await call('/reservations/' + reserved.body.id, 'GET', undefined, admin.body.token)).status, 404);
  assert.equal((await call('/reservations/' + reserved.body.id, 'GET', undefined, token)).body.id, reserved.body.id);
  assert.equal((await call('/reservations', 'POST', draft, token)).status, 409);
  assert.equal((await call('/reservations', 'GET', undefined, token)).body.length, 1);
  assert.equal((await call('/auth/logout', 'POST', undefined, token)).status, 204);
  assert.equal((await call('/auth/me', 'GET', undefined, token)).status, 401);
  console.log('HTTP smoke passed: registration, role restrictions, admin listing, shared catalog, date filtering, booking ownership/overlap, logout.');
} finally { await app.close(); }
