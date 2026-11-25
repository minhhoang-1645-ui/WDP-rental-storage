import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID, scryptSync } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ClosureRelocationService } from '../src/modules/transfers/closure-relocation.service.js';
import { AdditionalServiceInventoryService } from '../src/modules/additional-services/additional-service-inventory.service.js';
import { BillingService } from '../src/modules/billing/billing.service.js';
import { ContractsService } from '../src/modules/contracts/contracts.service.js';
import { ActiveRentalsService } from '../src/modules/rentals-active/active-rentals.service.js';
import { SupportService } from '../src/modules/support/support.service.js';
import { ReportingService } from '../src/modules/manager/reporting.service.js';
import { businessToday } from '../src/business-date.js';
import type { PublicUser } from '../src/modules/auth/auth.types.js';

const url = 'postgresql://relocation_test@127.0.0.1:55491/relocation_test';
const enabled = process.env.NESTBOX_RELOCATION_TEST === '1';
if (enabled && (process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url)) throw new Error('Relocation integration requires the isolated local database.');
const suite = enabled ? it : it.skip;
let db: PrismaService;
let app: INestApplication;
beforeAll(async () => { if (enabled) {
  db = new PrismaService(); await db.$connect();
  const { FoundationHttpModule } = await import('./foundation-http.module.js');
  const module = await Test.createTestingModule({ imports: [FoundationHttpModule] }).compile();
  app = module.createNestApplication(); app.setGlobalPrefix('api'); await app.init();
} });
afterAll(async () => { if (enabled) { await app?.close(); await db.$disconnect(); } });

suite('moves an active contract and service through both facilities without moving historical money or exposing foreign tasks', async () => {
  const prefix = randomUUID().slice(0,8);
  const password = 'isolated-relocation-test';
  const salt = 'e9d298534e3f43a2b8c7d1e2a3f40928';
  const passwordHash = ['scrypt',salt,scryptSync(password,salt,64).toString('hex')].join('$');
  const makeUser = async (name: string, role: PublicUser['role']): Promise<PublicUser> => {
    const user = await db.user.create({ data: { email: prefix + '-' + name + '@example.test', fullName: name, passwordHash, role } });
    return { id: user.id, email: user.email, fullName: user.fullName, phone: '', role };
  };
  const [bom, sourceManager, destinationManager, sourceStaff, receivingStaff, customer, other] = await Promise.all([
    makeUser('bom', 'BUSINESS_OPERATIONS_MANAGER'), makeUser('source-manager','FACILITY_MANAGER'), makeUser('destination-manager','FACILITY_MANAGER'),
    makeUser('source-staff','FACILITY_STAFF'), makeUser('destination-staff','FACILITY_STAFF'), makeUser('customer','STORAGE_CUSTOMER'), makeUser('other','STORAGE_CUSTOMER'),
  ]);
  const facility = async (suffix: string) => db.facility.create({ data: { code: prefix + suffix, name: suffix, address: 'Isolated test', officeHours: '08:00–17:00', accessHours: '08:00–17:00', bookingEnabled: true } });
  const [source, destination] = await Promise.all([facility('source'), facility('destination')]);
  for (const [person, site] of [[sourceManager, source], [destinationManager, destination], [sourceStaff, source], [receivingStaff, destination]] as const)
    await db.facilityAccess.create({ data: { userId: person.id, facilityId: site.id, grantedById: bom.id, activeKey: person.id + ':' + site.id } });
  await db.facilityAccess.create({data:{userId:sourceStaff.id,facilityId:destination.id,grantedById:bom.id,activeKey:sourceStaff.id+':'+destination.id}});
  const type = async (site: typeof source, suffix: string) => db.storageType.create({ data: {
    id: prefix + suffix, code: prefix + suffix, facilityId: site.id, name: 'Small', sizeId: 'small', sizeName: 'Small', kicker: 'Test', condition: 'STANDARD',
    widthCm: 150, lengthCm: 200, heightCm: 240, roomEquivalent: 'Test', capacity: 'Test', boxCount: 'Test', suitableItems: [], image: '', imageAlt: '', floor: 'Ground', access: 'Test', features: [], monthlyRate: 1500000,
  } });
  const [fromType, toType] = await Promise.all([type(source, '-from'), type(destination, '-to')]);
  const [from, to] = await Promise.all([
    db.storageUnit.create({ data: { storageTypeId: fromType.id, unitNumber: prefix + '-S', status: 'OCCUPIED' } }),
    db.storageUnit.create({ data: { storageTypeId: toType.id, unitNumber: prefix + '-D', status: 'AVAILABLE' } }),
  ]);
  const start = businessToday(), end = new Date(+start + 28 * 86400000);
  const quote = { currency: 'VND', storageTypeId: fromType.id, storageTypeName: fromType.name, quantity: 1, monthlyUnitPrice: 1500000, depositAmount: 1500000, rentalAmount: 1500000, billingMode: 'MONTHLY', paymentPlan: 'PREPAID', termMonths: 1 };
  const reservation = await db.reservation.create({ data: { reservationCode: prefix + '-R', customerId: customer.id, facilityId: source.id, storageTypeId: fromType.id, quantity: 1, startDate: start, endDate: end, periodMode: 'DURATION', durationMonths: 1, availabilitySnapshot: {}, quoteSnapshot: quote, status: 'CONFIRMED', confirmedAt: new Date(), idempotencyKey: prefix + '-reservation' } });
  const pendingBooking = await db.reservation.create({data:{reservationCode:prefix+'-PENDING',customerId:customer.id,facilityId:source.id,storageTypeId:fromType.id,quantity:1,startDate:start,endDate:end,periodMode:'DURATION',durationMonths:1,availabilitySnapshot:{},quoteSnapshot:quote,status:'PENDING',idempotencyKey:prefix+'-pending'}});
  const unhandedBooking = await db.reservation.create({data:{reservationCode:prefix+'-UNHANDED',customerId:customer.id,facilityId:source.id,storageTypeId:fromType.id,quantity:1,startDate:start,endDate:end,periodMode:'DURATION',durationMonths:1,availabilitySnapshot:{},quoteSnapshot:quote,status:'CONFIRMED',idempotencyKey:prefix+'-unhanded'}});
  const unhandedUnit=await db.storageUnit.create({data:{storageTypeId:fromType.id,unitNumber:prefix+'-WAIT',status:'AVAILABLE'}});
  const unhandedAllocation=await db.reservationUnit.create({data:{reservationId:unhandedBooking.id,storageUnitId:unhandedUnit.id,plannedStartDate:start,plannedEndDate:end}});
  const unhandedContract=await db.rentalContract.create({data:{contractCode:prefix+'-UNHANDED-C1',reservationId:unhandedBooking.id,reservationUnitId:unhandedAllocation.id,startDate:start,endDate:end,status:'READY_FOR_HANDOVER',signedSnapshot:{original:true},termsAcceptedAt:new Date(),termsAcceptedByUserId:customer.id}});
  const unhandedInvoice=await db.invoice.create({data:{invoiceCode:prefix+'-UNHANDED-I1',reservationId:unhandedBooking.id,type:'INITIAL',status:'PAID',rentalAmount:1500000n,depositAmount:1500000n,totalAmount:3000000n,amountPaid:3000000n,balanceDue:0n,paidAt:new Date()}});
  const unhandedPayment=await db.payment.create({data:{paymentCode:prefix+'-UNHANDED-P1',invoiceId:unhandedInvoice.id,amount:3000000n,method:'CASH',idempotencyKey:prefix+'-unhanded-payment'}});
  const allocation = await db.reservationUnit.create({ data: { reservationId: reservation.id, storageUnitId: from.id, plannedStartDate: start, plannedEndDate: end } });
  const contract = await db.rentalContract.create({ data: { contractCode: prefix + '-C', reservationId: reservation.id, reservationUnitId: allocation.id, startDate: start, endDate: end, status: 'ACTIVE', activatedAt: new Date(), signedSnapshot: { original: true }, termsAcceptedAt: new Date(), termsAcceptedByUserId: customer.id } });
  await db.handoverAppointment.create({data:{appointmentCode:prefix+'-OLD-HANDOVER',reservationId:reservation.id,status:'COMPLETED',scheduledAt:new Date(),requestedByUserId:customer.id,assignedStaffUserId:sourceStaff.id,completedByUserId:sourceStaff.id,completedAt:new Date(),idempotencyKey:prefix+'-old-handover'}});
  const invoice = await db.invoice.create({ data: { invoiceCode: prefix + '-I', reservationId: reservation.id, status: 'PAID', billingPeriodStart: start, billingPeriodEnd: end, rentalAmount: 1500000n, depositAmount: 1500000n, serviceAmount:300000n, totalAmount: 3300000n, amountPaid: 3300000n, balanceDue: 0n, paidAt: new Date() } });
  await db.payment.create({ data: { paymentCode: prefix + '-P', invoiceId: invoice.id, amount: 3300000n, method: 'CASH', idempotencyKey: prefix + '-pay' } });
  const service = await db.additionalService.create({ data: { code: prefix + '-equipment', name: 'Equipment', kind: 'RENTAL', billingUnit: 'DAY', physicalUnit: 'piece', isActive: true } });
  for (const site of [source, destination]) await db.facilityServiceOffering.create({ data: { additionalServiceId: service.id, facilityId: site.id, isActive: true, unitPrice: 10000n, rentalCapacity: 1 } });
  const line = await db.reservationService.create({ data: { reservationId: reservation.id, additionalServiceId: service.id, serviceCodeSnapshot: service.code, serviceNameSnapshot: service.name, serviceKindSnapshot: 'RENTAL', billingUnitSnapshot: 'DAY', unitPriceSnapshot: 10000n, quantity: 1, serviceStartDate: start, serviceEndDate: end, amountSnapshot: 280000n } });
  const product = await db.additionalService.create({ data: { code: prefix + '-product', name: 'Box', kind: 'PURCHASE', billingUnit: 'ONE_TIME', physicalUnit: 'box', isActive: true } });
  for (const site of [source, destination]) await db.facilityServiceOffering.create({ data: { additionalServiceId: product.id, facilityId: site.id, isActive: true, unitPrice: 20000n, stockOnHand: 5 } });
  const purchased = await db.reservationService.create({ data: { reservationId: reservation.id, additionalServiceId: product.id, serviceCodeSnapshot: product.code, serviceNameSnapshot: product.name, serviceKindSnapshot: 'PURCHASE', billingUnitSnapshot: 'ONE_TIME', unitPriceSnapshot: 20000n, quantity: 1, fulfillmentStatus: 'RESERVED', amountSnapshot: 20000n } });
  const inventory = new AdditionalServiceInventoryService(db);
  const relocation = new ClosureRelocationService(db, inventory, new BillingService(db));
  const users = [bom,sourceManager,destinationManager,sourceStaff,receivingStaff,customer,other];
  const tokens = new Map<string,string>();
  for (const person of users) {
    const result = await request(app.getHttpServer()).post('/api/auth/login').send({email:person.email,password});
    expect(result.status).toBe(200); tokens.set(person.id,result.body.token);
  }
  const api = async (method: 'get'|'post'|'patch', path:string, person:PublicUser, body?:object, status = method === 'post' ? 201 : 200) => {
    let op = request(app.getHttpServer())[method]('/api'+path).set('Authorization','Bearer '+tokens.get(person.id)).set('Idempotency-Key',randomUUID());
    if (body) op=op.send(body);
    const response = await op;
    expect(response.status,method+' '+path+': '+JSON.stringify(response.body)).toBe(status);
    return response.body;
  };
  expect((await request(app.getHttpServer()).get('/api/health')).body).toMatchObject({release:'nestbox-facility-closure-relocation-20261124'});
  expect((await request(app.getHttpServer()).get('/api/health/ready')).status).toBe(200);
  await api('patch','/operations/facilities/'+source.id,bom,{ expectedUpdatedAt: source.updatedAt.toISOString(), operationalStatus: 'CLOSING', closureMode: 'REQUIRED_RELOCATION', closureReason: 'Isolated safety test', bookingEnabled: false });
  const closing = await db.facility.findUniqueOrThrow({where:{id:source.id}});
  await api('patch','/operations/facilities/'+source.id,bom,{ expectedUpdatedAt: closing.updatedAt.toISOString(), operationalStatus: 'CLOSED', bookingEnabled: false },409);
  expect(await api('post','/relocations/facilities/'+source.id+'/notify',sourceManager,{})).toMatchObject({sent:true,count:1});
  expect(await api('post','/relocations/facilities/'+source.id+'/notify',sourceManager,{})).toMatchObject({sent:false});
  expect(await relocation.affected(sourceManager)).toHaveLength(1);
  expect(await relocation.affected(destinationManager)).toHaveLength(0);
  expect(await api('get','/relocations/pending-bookings',sourceManager)).toEqual(expect.arrayContaining([
    expect.objectContaining({id:pendingBooking.id,paid:false,signed:false}),expect.objectContaining({id:unhandedBooking.id,paid:true,signed:true}),
  ]));
  expect(await api('get','/relocations/pending-bookings',destinationManager)).toEqual([]);
  await api('get','/relocations/pending-bookings',customer,undefined,403);
  await api('patch','/manager/reservations/'+pendingBooking.id+'/status',sourceManager,{status:'CONFIRMED'},409);
  await api('patch','/manager/reservations/'+pendingBooking.id+'/status',sourceManager,{status:'CANCELLED'});
  const bookingPath='/relocations/bookings/'+unhandedBooking.id+'/resolve';
  const cancellation={action:'CANCEL',customerAgreed:true,note:'Customer agreed to cancel and receive all payments back'};
  await api('post',bookingPath,destinationManager,cancellation,403);
  await api('post',bookingPath,sourceManager,{...cancellation,customerAgreed:false},400);
  const refund=await api('post',bookingPath,sourceManager,cancellation);
  expect(refund).toEqual({status:'CLOSURE_BOOKING_REFUND_PENDING',refundAmount:'3000000',confirmed:false});
  expect(await api('post',bookingPath,sourceManager,cancellation)).toEqual(refund);
  expect(await db.invoice.findUnique({where:{id:unhandedInvoice.id}})).toEqual(unhandedInvoice);
  expect(await db.payment.findUnique({where:{id:unhandedPayment.id}})).toEqual(unhandedPayment);
  expect(await db.rentalContract.findUnique({where:{id:unhandedContract.id}})).toMatchObject({status:'CANCELLED',signedSnapshot:{original:true}});
  expect((await db.reservationUnit.findUnique({where:{id:unhandedAllocation.id}}))?.releasedAt).toBeTruthy();
  await api('post',bookingPath,sourceManager,{action:'CONFIRM_REFUND',refunded:true,refundAmount:'3000001',note:'Test stale expected refund'},409);
  const confirmation={action:'CONFIRM_REFUND',refunded:true,refundAmount:'3000000',note:'Verified the actual refund'};
  const confirmedRefund=await api('post',bookingPath,sourceManager,confirmation);
  expect(confirmedRefund).toEqual({status:'CLOSURE_BOOKING_REFUND_RECORDED',refundAmount:'3000000',confirmed:true});
  expect(await api('post',bookingPath,sourceManager,confirmation)).toEqual(confirmedRefund);
  expect(await db.supportRequest.count({where:{reservationId:unhandedBooking.id}})).toBe(1);
  const task = await api('post','/relocations/contracts/'+contract.id+'/assign',sourceManager,{staffUserId:sourceStaff.id});
  await expect(relocation.destinations(task.id, receivingStaff)).rejects.toThrow();
  const offered = await relocation.destinations(task.id, sourceStaff);
  expect(offered.some(unit => unit.id === to.id)).toBe(true);
  const proposal = await api('post','/relocations/tasks/'+task.id+'/propose',sourceStaff,{destinationId:to.id});
  await expect(relocation.consent(proposal.id, other, { agreed: true, destinationId: to.id })).rejects.toThrow();
  expect((await relocation.records(customer)).some(row => row.id === proposal.id)).toBe(true);
  await api('post','/relocations/'+proposal.id+'/consent',customer,{agreed:true,destinationId:to.id});
  await api('post','/relocations/'+proposal.id+'/consent',customer,{agreed:true,destinationId:to.id});
  expect(await db.reservationUnit.count({where:{reservationId:reservation.id,storageUnitId:to.id}})).toBe(1);
  await api('post','/relocations/'+proposal.id+'/receiving-staff',destinationManager,{staffUserId:receivingStaff.id});
  const handover = (side: string) => ({ side, confirmed: true, servicesConfirmed: true, note: 'Verified physical handover and access' });
  await expect(relocation.handover(proposal.id, sourceStaff, handover('source'))).rejects.toThrow('an toàn');
  await api('post','/relocations/'+proposal.id+'/safety',sourceManager,{evidence:'Site safety verified'});
  await expect(relocation.handover(proposal.id, sourceStaff, handover('source'))).rejects.toThrow('dịch vụ');
  await api('post','/relocations/'+proposal.id+'/services',destinationManager,{evidence:'Source equipment returned, destination replacements agreed with customer'});
  await api('post','/relocations/'+proposal.id+'/handover',sourceStaff,handover('source'));
  await expect(relocation.handover(proposal.id, sourceStaff, handover('destination'))).rejects.toThrow();
  await api('post','/relocations/'+proposal.id+'/report-exception',receivingStaff,{side:'destination',note:'Need manager coordination before releasing access'});
  await api('post','/relocations/'+proposal.id+'/handover',receivingStaff,handover('destination'),409);
  await api('post','/relocations/'+proposal.id+'/cancel',sourceManager,{note:'Cannot cancel physically started transfer'},409);
  await api('post','/relocations/tasks/'+task.id+'/resolve-exception',destinationManager,{action:'RETRY',note:'Destination cannot override source manager'},403);
  await api('post','/relocations/tasks/'+task.id+'/resolve-exception',sourceManager,{action:'RETRY',note:'Destination facility and staff coordination verified'});
  const destinationOffering={additionalServiceId_facilityId:{additionalServiceId:product.id,facilityId:destination.id}};
  await db.facilityServiceOffering.update({where:destinationOffering,data:{stockOnHand:0}});
  await api('post','/relocations/'+proposal.id+'/handover',receivingStaff,handover('destination'),409);
  expect(await db.reservationService.findUnique({where:{id:purchased.id}})).toMatchObject({fulfillmentStatus:'RESERVED'});
  expect(await db.rentalContract.findUnique({where:{id:contract.id}})).toMatchObject({reservationUnitId:allocation.id});
  expect(await db.reservationUnit.findUnique({where:{id:allocation.id}})).toMatchObject({releasedAt:null});
  await db.facilityServiceOffering.update({where:destinationOffering,data:{stockOnHand:5}});
  await api('post','/relocations/'+proposal.id+'/handover',receivingStaff,handover('destination'));
  await api('post','/relocations/'+proposal.id+'/handover',receivingStaff,handover('destination'));
  const updated = await db.rentalContract.findUniqueOrThrow({ where: { id: contract.id }, include: { reservationUnit: true } });
  expect(updated.reservationUnit.storageUnitId).toBe(to.id);
  expect(updated.signedSnapshot).toEqual(contract.signedSnapshot);
  expect(updated.endDate).toEqual(contract.endDate);
  expect(updated.currentMonthlyRate).toBe(contract.currentMonthlyRate);
  expect(await db.invoice.findUnique({ where: { id: invoice.id } })).toEqual(invoice);
  expect(await db.invoice.count({ where: { reservationId: reservation.id } })).toBe(1);
  expect(await db.payment.count({ where: { invoiceId: invoice.id } })).toBe(1);
  expect((await db.reservationService.findUniqueOrThrow({where:{id:line.id}})).serviceFacilityId).toBe(destination.id);
  expect(await db.reservationService.findUnique({where:{id:purchased.id}})).toMatchObject({serviceFacilityId:destination.id,fulfillmentStatus:'FULFILLED'});
  expect((await db.facilityServiceOffering.findUniqueOrThrow({where:{additionalServiceId_facilityId:{additionalServiceId:product.id,facilityId:source.id}}})).stockOnHand).toBe(5);
  expect((await db.facilityServiceOffering.findUniqueOrThrow({where:{additionalServiceId_facilityId:{additionalServiceId:product.id,facilityId:destination.id}}})).stockOnHand).toBe(4);
  const rentals = new ActiveRentalsService(db);
  expect((await rentals.getCustomerRental(customer.id,reservation.id)).contracts[0].unit.id).toBe(to.id);
  expect((await rentals.getManagerRental(reservation.id,destinationManager)).contracts[0].unit.id).toBe(to.id);
  await expect(rentals.getManagerRental(reservation.id,sourceManager)).rejects.toThrow();
  expect((await rentals.getStaffRental(receivingStaff,reservation.id)).contracts[0].unit.id).toBe(to.id);
  await expect(rentals.getStaffRental(sourceStaff,reservation.id)).rejects.toThrow();
  const contracts = new ContractsService(db);
  expect((await contracts.getManagerContract(contract.id,destinationManager)).storageUnit.id).toBe(to.id);
  await expect(contracts.getManagerContract(contract.id,sourceManager)).rejects.toThrow();
  const support = new SupportService(db);
  const supportRequest = await support.createCustomer(customer,{reservationId:reservation.id,rentalContractId:contract.id,category:'LOCK_OR_KEY_ISSUE',subject:'Lock issue',description:'Need assistance with new lock'}, prefix + '-support');
  await expect(support.assign(supportRequest.id,{staffUserId:sourceStaff.id},prefix+'-bad-assign',sourceManager)).rejects.toThrow();
  await support.assign(supportRequest.id,{staffUserId:receivingStaff.id},prefix+'-assign',destinationManager);
  const report = await new ReportingService(db).dashboard({},bom);
  expect(report.items.find(item=>item.id===source.id)).toMatchObject({activeContracts:0,units:{occupied:0},received:'6300000'});
  expect(report.items.find(item=>item.id===destination.id)).toMatchObject({activeContracts:1,units:{occupied:1},received:'0'});
  const renewal = await api('post','/customer/renewals',customer,{reservationId:reservation.id,rentalContractId:contract.id,termMonths:1,paymentPlan:'PAY_MONTHLY'});
  expect(renewal.status).toBe('APPROVED_PENDING_PAYMENT');
  const renewedInvoice = await db.invoice.findFirstOrThrow({where:{renewalRequestId:renewal.id}});
  expect(renewedInvoice.facilityIdSnapshot).toBe(destination.id);
  await api('get','/manager/invoices/'+renewedInvoice.id,destinationManager);
  await api('get','/manager/invoices/'+renewedInvoice.id,sourceManager,undefined,404);
  const withRenewal=await new ReportingService(db).dashboard({},bom);
  expect(withRenewal.items.find(item=>item.id===destination.id)).toMatchObject({debt:String(renewedInvoice.balanceDue)});
  expect(withRenewal.items.find(item=>item.id===source.id)).toMatchObject({received:'6300000',debt:'0'});
  const performance = await api('get','/operations/reports/performance?facilityId='+source.id,bom);
  expect(performance.items).toEqual([expect.objectContaining({id:source.id,received:'6300000',bookingRefunded:'3000000',debt:'0'})]);
  await api('patch','/operations/facilities/'+source.id,bom,{ expectedUpdatedAt: closing.updatedAt.toISOString(), operationalStatus: 'CLOSED', bookingEnabled:false });
  expect((await db.facility.findUniqueOrThrow({where:{id:source.id}})).operationalStatus).toBe('CLOSED');
}, 60000);
