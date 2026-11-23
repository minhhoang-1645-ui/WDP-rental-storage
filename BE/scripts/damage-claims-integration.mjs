import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const testUrl = process.env.DAMAGE_CLAIMS_TEST_DATABASE_URL;
if (!testUrl || new URL(testUrl).hostname !== '127.0.0.1' || !process.env.SEED_TEST_USERS_PASSWORD) {
  throw new Error('Run with a migrated, seeded, isolated PostgreSQL database on 127.0.0.1 and SEED_TEST_USERS_PASSWORD.');
}
process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = testUrl;
process.env.NODE_ENV = 'test';
const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('../dist/app.module.js');
const { PrismaService } = await import('../dist/prisma/prisma.service.js');
const { businessDate } = await import('../dist/business-date.js');
const app = await NestFactory.create(AppModule, { logger: false });
app.setGlobalPrefix('api');
await app.listen(0, '127.0.0.1');
const prisma = app.get(PrismaService);
const base = (await app.getUrl()) + '/api';
const customerPath = '/customer/damage-claims';
const managerPath = '/manager/damage-claims';
const staffPath = '/staff/management/damage-claims';
const tag = randomUUID();

async function request(path, expected, { token, method = 'GET', body, key } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(key ? { 'Idempotency-Key': key } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}

const login = email => request('/auth/login', 200, {
  method: 'POST', body: { email, password: process.env.SEED_TEST_USERS_PASSWORD },
});
const patch = (path, token, body, status = 200) => request(path, status, { token, method: 'PATCH', body });

try {
  const customer = await login('customer@test.com');
  const manager = await login('manager@test.com');
  const staff = await login('staff@test.com');
  const admin = await login('admin@test.com');
  const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { id: staff.user.id }, select: { passwordHash: true } });
  const otherStaff = await prisma.user.create({ data: {
    role: 'FACILITY_STAFF', fullName: 'Unassigned test staff', phone: '0900000082', email: `claims-staff-${tag}@example.test`, passwordHash,
  } });
  const other = await login(otherStaff.email);
  const contract = await prisma.rentalContract.findUniqueOrThrow({ where: { contractCode: 'WDP-DEMO-ACTIVE-C01' }, include: { reservationUnit: true } });
  const unitId = contract.reservationUnit.storageUnitId;
  const taskUnit = await prisma.storageUnit.findUniqueOrThrow({where:{id:unitId},select:{storageType:{select:{facilityId:true}}}});
  for (const userId of [staff.user.id, manager.user.id]) {
    if (!await prisma.facilityAccess.findFirst({where:{userId,facilityId:taskUnit.storageType.facilityId,revokedAt:null}})) throw new Error('Admin must grant facility access before this scenario.');
  }

  async function report(name) {
    const body = { rentalContractId: contract.id, description: `Hộp hàng bị móp ${name} ${tag}`, discoveredOn: businessDate(), estimatedValue: 150000, storedItemIds: [], evidenceLinks: ['https://example.test/evidence'] };
    const key = randomUUID();
    const created = await request(customerPath, 201, { token: customer.token, method: 'POST', key, body });
    assert.equal((await request(customerPath, 201, { token: customer.token, method: 'POST', key, body })).id, created.id);
    return created;
  }

  async function inspect(created) {
    const managerClaim = `${managerPath}/${created.id}`;
    const staffClaim = `${staffPath}/${created.id}`;
    let record = await request(managerClaim, 200, { token: manager.token });
    assert.equal(record.assignedStaff, null);
    assert.equal(record.compensation.status, 'PENDING_REVIEW');
    assert.ok((await request(`${managerPath}?stage=unassigned&search=${tag}&limit=10`, 200, { token: manager.token })).items.some(item => item.id === created.id));
    await request(staffClaim, 404, { token: staff.token });
    await patch(staffClaim, staff.token, { expectedUpdatedAt: record.updatedAt, staffFacts: 'Hàng đã kiểm tra trực tiếp.' }, 403);
    await patch(managerClaim + '/assign', manager.token, { staffUserId: staff.user.id });
    assert.equal((await request(`${staffPath}?id=${created.id}`, 200, { token: other.token })).total, 0);
    await request(staffClaim, 404, { token: other.token });
    record = await request(staffClaim, 200, { token: staff.token });
    assert(!('compensation' in record));
    assert.equal(record.assignedStaff.id, staff.user.id);
    await patch(staffClaim, staff.token, { expectedUpdatedAt: record.updatedAt, staffFacts: 'Đã kiểm tra, có một hộp bị móp.' });
    record = await request(managerClaim, 200, { token: manager.token });
    assert.equal(record.staffFacts, 'Đã kiểm tra, có một hộp bị móp.');
    assert.equal(record.history.find(({ action }) => action === 'INSPECTED').actorName, staff.user.fullName);
    const filtered = await request(`${managerPath}?id=${created.id}&limit=1`, 200, { token: manager.token });
    assert.deepEqual(filtered.items, [record]);
    return record;
  }

  let claim = await inspect(await report('bồi thường'));
  const m = `${managerPath}/${claim.id}`, c = `${customerPath}/${claim.id}`, s = `${staffPath}/${claim.id}`;
  const handover = `${m}/compensation/handover`;
  const approve = { expectedUpdatedAt: claim.updatedAt, decision: 'APPROVED', decisionReason: 'Chấp thuận theo kết quả kiểm tra thực tế.' };
  await patch(handover, manager.token, {}, 409);
  await patch(m, manager.token, { ...approve, approvedCompensationAmount: -10 }, 400);
  await patch(m, manager.token, { ...approve, approvedCompensationAmount: 100000 });
  let visible = await request(c, 200, { token: customer.token });
  assert.equal(visible.estimatedValue, 150000);
  assert.equal(visible.compensation.approvedCompensationAmount, 100000);
  assert.equal(visible.compensation.paidCompensationAmount, null);
  assert.equal(visible.compensation.status, 'AWAITING_HANDOVER');
  assert.ok(!(await request(s, 200, { token: staff.token })).compensation);
  await patch(m, manager.token, { action: 'resolve', expectedUpdatedAt: visible.updatedAt, resolutionNote: 'Đã báo kết quả cho khách.' }, 409);
  claim = await patch(m, manager.token, { action: 'notify', expectedUpdatedAt: visible.updatedAt, resolutionNote: 'Đã báo kết quả cho khách.' });
  assert.equal(claim.compensation.status, 'AWAITING_HANDOVER');
  const handedOverAt = new Date().toISOString();
  const cash = { expectedUpdatedAt: claim.updatedAt, paidCompensationAmount: 100000, handedOverAt, deliveredBy: 'Người giao thử', receivedBy: 'Người nhận thử', handoverNote: 'Đã kiểm đếm.', confirmCashHandover: true, recordedById: other.user.id };
  for (const account of [staff, customer, admin]) await patch(handover, account.token, cash, 403);
  await patch(handover, manager.token, { ...cash, handedOverAt: '2025-01-01T00:00:00.000Z' }, 400);
  await patch(handover, manager.token, { ...cash, handedOverAt: '2200-01-01T00:00:00.000Z' }, 400);
  await patch(handover, manager.token, { ...cash, confirmCashHandover: false }, 400);
  await patch(handover, manager.token, { ...cash, paidCompensationAmount: 99999 }, 400);

  const outcomes = await Promise.all([1, 2].map(() => fetch(base + handover, {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + manager.token, 'Content-Type': 'application/json' }, body: JSON.stringify(cash),
  })));
  assert.deepEqual(outcomes.map(response => response.status).sort(), [200, 409]);
  for (const response of outcomes) await response.json();
  await patch(handover, manager.token, cash, 409);
  const receipt = await prisma.damageClaimCompensation.findUniqueOrThrow({ where: { damageClaimId: claim.id } });
  assert.equal(receipt.approvedById, manager.user.id);
  assert.equal(receipt.recordedById, manager.user.id);
  assert.equal(receipt.paidCompensationAmount, 100000n);
  assert.equal(receipt.deliveredBy, cash.deliveredBy);
  assert.equal(receipt.receivedBy, cash.receivedBy);
  assert.equal(receipt.handedOverAt.toISOString(), handedOverAt);
  const internal = await request(m, 200, { token: manager.token });
  assert.equal(internal.compensation.recordedBy, manager.user.fullName);
  assert.equal(internal.history.filter(({ action }) => action === 'CASH_HANDED_OVER').length, 1);
  assert.equal(await prisma.auditEvent.count({ where: { action: 'HANDOVER', resource: 'damage-claims', outcome: 'SUCCESS', resourceId: claim.id, actorId: manager.user.id } }), 1);
  visible = await request(c, 200, { token: customer.token });
  assert.deepEqual(visible.compensation, { status: 'HANDED_OVER', approvedCompensationAmount: 100000, paidCompensationAmount: 100000, method: 'CASH', handedOverAt });
  assert.equal((await patch(m, manager.token, { action: 'resolve', expectedUpdatedAt: visible.updatedAt })).status, 'RESOLVED');
  assert.equal((await request(c, 200, { token: customer.token })).compensation.status, 'HANDED_OVER');

  for (const decision of ['REJECTED', 'APPROVED']) {
    const otherClaim = await inspect(await report(`quyết định ${decision}`));
    const managerRecord = `${managerPath}/${otherClaim.id}`;
    const body = { expectedUpdatedAt: otherClaim.updatedAt, decision, decisionReason: 'Quyết định dựa trên kết quả kiểm tra.' };
    if (decision === 'REJECTED') await patch(managerRecord, manager.token, { ...body, approvedCompensationAmount: 100000 }, 400);
    const resolved = await patch(managerRecord, manager.token, body);
    assert.equal(resolved.compensation.status, 'NONE');
    assert.equal(await prisma.damageClaimCompensation.count({ where: { damageClaimId: otherClaim.id } }), 0);
    await patch(managerRecord + '/compensation/handover', manager.token, cash, 409);
    assert.equal((await patch(managerRecord, manager.token, { action: 'resolve', expectedUpdatedAt: resolved.updatedAt, resolutionNote: 'Đã thông báo cho khách.' })).status, 'RESOLVED');
  }
  assert.equal((await request(`${managerPath}?search=${tag}&limit=1&page=2&stage=resolved`, 200, { token: manager.token })).total, 3);
  console.log('PASS damage claims API: report, scoped assignment and inspection, compensation approval, notification, full cash handover, concurrent duplicate rejection, audit, roles, and no-compensation decisions.');
} finally {
  await app.close();
}
