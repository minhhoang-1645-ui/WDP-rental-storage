import { AuditService } from '../src/modules/audit/audit.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { PrismaUserRepository } from '../src/modules/users/user.repository.js';
import { MaintenanceService } from '../src/modules/maintenance/maintenance.service.js';
import { DamageClaimsService } from '../src/modules/claims/damage-claims.service.js';
import { ReportingService } from '../src/modules/manager/reporting.service.js';
import {RenewalsService} from '../src/modules/renewals/renewals.service.js';
import {VnpayService} from '../src/modules/billing/vnpay.service.js';
import {OnlinePaymentService} from '../src/modules/billing/online-payment.service.js';
import {AdditionalServicesService} from '../src/modules/additional-services/additional-services.service.js';
import {AdditionalServiceInventoryService} from '../src/modules/additional-services/additional-service-inventory.service.js';
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID,createHmac} from 'node:crypto';
import {signature} from './foundation-fixtures.js';
import {ConfigService} from '@nestjs/config';
import {ForbiddenException} from '@nestjs/common';
import {PrismaService} from '../src/prisma/prisma.service.js';
import type {PublicUser} from '../src/modules/auth/auth.types.js';
import {FacilityAccessService} from '../src/modules/facility-access/facility-access.service.js';
import {BookingService} from '../src/modules/booking/booking.service.js';
import {ContractsService} from '../src/modules/contracts/contracts.service.js';
import {BillingService} from '../src/modules/billing/billing.service.js';
import {OverduePaymentWorker} from '../src/modules/billing/overdue-payment.js';
import {AppointmentsService} from '../src/modules/appointments/appointments.service.js';
import {SupportService} from '../src/modules/support/support.service.js';
import {TransfersService} from '../src/modules/transfers/transfers.service.js';
import {TransferCommercialService} from '../src/modules/transfers/transfer-commercial.service.js';
import {ReturnsService} from '../src/modules/returns/returns.service.js';
import {DepositSettlementsService} from '../src/modules/deposit-settlements/deposit-settlements.service.js';
import {ManagerService} from '../src/modules/manager/manager.service.js';
import {OperationsService} from '../src/modules/operations/operations.service.js';
import { resolveMonthlyRange } from '../src/modules/pricing/monthly-price-range.js';
import {BusinessPolicyService} from '../src/modules/policies/business-policy.service.js';
import {SigningOtpService} from '../src/modules/signing/signing-otp.service.js';
import type {EmailService} from '../src/modules/guest-booking/email.service.js';
import {DocumentPolicy} from '../src/modules/documents/document-policy.js';
import {businessToday} from '../src/business-date.js';
import {loadPricingPolicy, pricingPolicyDefaults} from '../src/modules/policies/pricing-policy.js';

const isolatedUrl='postgresql://nestbox_test@127.0.0.1:55439/nestbox_foundation_test';
if(process.env.NESTBOX_ISOLATED_TEST!=='1'||process.env.DATABASE_URL!==isolatedUrl||process.env.NESTBOX_TEST_DATABASE_URL!==isolatedUrl||process.env.DIRECT_URL!==isolatedUrl)throw Error('Never run foundation checks against shared data.');
const db=new PrismaService(), access=new FacilityAccessService(db),policies=new BusinessPolicyService(db),ops=new OperationsService(db),managerService=new ManagerService(db);
const users:Record<string,PublicUser>={};
let otp='';
let temporaryDepositRule: { id: string; previous: { id: string; effectiveTo: Date | null } | null } | undefined;
const signing=new SigningOtpService({signatureDeliveryConfigured:()=>true,sendSignatureOtp:async(input:{code:string})=>{otp=input.code;}} as unknown as EmailService,db);
const contracts=new ContractsService(db,signing,new DocumentPolicy(new ConfigService({})));
const billing=new BillingService(db), booking=new BookingService(db,undefined,contracts,billing,undefined,policies),appointments=new AppointmentsService(db,undefined,undefined,policies),support=new SupportService(db),transfers=new TransfersService(db),returns=new ReturnsService(db),deposits=new DepositSettlementsService(db);
const key=()=>randomUUID(), date=(n=0)=>new Date(businessToday().getTime()+n*86400000).toISOString().slice(0,10);
async function reserve(facility='A',quantity=1,start=date(),selected?:string,customer=users.customer){
 const created=await booking.createReservation(customer,{productId:'type-'+facility,startDate:start,periodMode:'duration',durationMonths:1,quantity,adjacencyPreference:false,addonIds:[],paymentChoice:'pay-later',paymentPlan:'PAY_MONTHLY',note:key(),...(selected?{selectedUnitIds:[selected]}:{})});
 if(created.status!=='CONFIRMED') { await booking.updateManagerReservationStatus(created.id,{status:'CONFIRMED'},users['manager'+facility]); throw new Error('Valid reservation required manual confirmation.'); }
 return db.reservation.findUniqueOrThrow({where:{reservationCode:created.id}});
}
async function signAll(reservationId:string,customer=users.customer){
 const records=await db.rentalContract.findMany({where:{reservationId}});
 for(const record of records){
  const view=await contracts.getCustomerContract(customer.id,record.id);
  const body={agreed:true,acceptanceName:customer.fullName,signatureImage:signature(),snapshotHash:view.terms.snapshotHash};
  const challenge=await contracts.requestSignatureOtp(customer,record.id,body);
  await contracts.acceptCustomerContract(customer,record.id,{...body,challengeId:challenge.challengeId,otp,accepted:true});
 }
}
beforeAll(async()=>{
 await db.$connect();
 for(const[id,role]of [['customer','STORAGE_CUSTOMER'],['other','STORAGE_CUSTOMER'],['staffA','FACILITY_STAFF'],['staffA2','FACILITY_STAFF'],['staffB','FACILITY_STAFF'],['managerA','FACILITY_MANAGER'],['managerB','FACILITY_MANAGER'],['bom','BUSINESS_OPERATIONS_MANAGER'],['admin','SYSTEM_ADMINISTRATOR']] as const){
  const u=await db.user.create({data:{id,role,email:id+'@foundation.test',fullName:'Test '+id,passwordHash:'isolated-only',phone:''}});users[id]={id:u.id,role:u.role,email:u.email,fullName:u.fullName,phone:''};
 }
 for(const id of ['A','B']){
  await db.facility.create({data:{id,code:id,name:'Facility '+id,address:'Isolated test'}});
  await db.businessRule.create({data:{key:'monthlyPriceRange:small',facilityId:id,version:1,value:{min:1000000,max:2400000},effectiveFrom:new Date('2000-01-01Z'),createdById:users.bom.id}});
  await db.storageType.create({data:{id:'type-'+id,facilityId:id,code:'TYPE-'+id,name:'Kho '+id,sizeId:'small',sizeName:'Kho nhỏ',kicker:'Test',condition:'STANDARD',widthCm:150,lengthCm:200,heightCm:240,roomEquivalent:'Test',capacity:'Test',boxCount:'Test',suitableItems:[],image:'https://example.test/unit.jpg',imageAlt:'Test',floor:'Ground',access:'Test',features:[],monthlyRate:1500000,minRentalDays:1,allowDailyRental:true}});
  await db.storageUnit.createMany({data:Array.from({length:16},(_,i)=>({id:id+'-'+i,storageTypeId:'type-'+id,unitNumber:id+'-'+i,floor:'Ground',zone:id,row:1,position:i+1}))});
  for(const who of ['manager'+id,'staff'+id,...(id==='A'?['staffA2']:[])])await access.grant(users.admin,{userId:who,facilityId:id});
 }
});
afterAll(async () => {
 try {
   if (temporaryDepositRule) {
     const { id, previous } = temporaryDepositRule;
     await db.$transaction(async tx => {
       await tx.businessRule.delete({ where: { id } });
       if (previous) await tx.businessRule.update({ where: { id: previous.id }, data: { effectiveTo: previous.effectiveTo } });
     });
   }
 } finally {
   await db.$disconnect();
 }
});
it('assesses one overdue rent charge across workers and keeps it in the billing facility', async () => {
 const reservation = await reserve('B');
 const now = new Date();
 const dueAt = new Date(+businessToday(now) - 6 * 86_400_000);
 const initial = await db.invoice.findFirstOrThrow({ where: { reservationId: reservation.id, type: 'INITIAL' } });
 const original = await db.invoice.create({ data: { invoiceCode: `${initial.invoiceCode}-P2`, reservationId: reservation.id,
  type: 'RECURRING', billingCycle: 2, dueAt, rentalAmount: 500_000n, depositAmount: 0n, serviceAmount: 50_000n,
  totalAmount: 550_000n, balanceDue: 550_000n, facilityIdSnapshot: 'B', pricingSnapshot: { pricingPolicy: {
   paymentOverdue: { version: 1, value: { graceDays: 5, managerDays: 15, feeMethod: 'RENT_DEBT_PERCENTAGE', feeAmount: 10 } },
  } },
 } });
 try {
  await Promise.all([new OverduePaymentWorker(db).assess(now), new OverduePaymentWorker(db).assess(now)]);
  const lateCode = `${original.invoiceCode}-LATE`;
  const adjustment = await db.invoice.findUniqueOrThrow({ where: { invoiceCode: lateCode } });
  expect(adjustment).toMatchObject({ chargeAmount: 50_000n, balanceDue: 50_000n, facilityIdSnapshot: 'B' });
  expect(await db.invoice.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({ totalAmount: 550_000n, balanceDue: 550_000n });
  expect(await billing.getManagerInvoice(adjustment.id, users.managerB)).toMatchObject({ invoiceCode: lateCode });
  await expect(billing.getManagerInvoice(adjustment.id, users.managerA)).rejects.toThrow();
 } finally {
  await db.invoice.deleteMany({ where: { invoiceCode: `${original.invoiceCode}-LATE` } });
  await db.invoice.delete({ where: { id: original.id } });
 }
});
it('refunds a paid booking only after customer confirmation and scoped manager review', async () => {
 const customer = users.other;
 const reservation = await reserve('B', 1, date(7), undefined, customer);
 await signAll(reservation.id, customer);
 const invoice = await db.invoice.findFirstOrThrow({ where: { reservationId: reservation.id, type: 'INITIAL' } });
 await billing.recordPayment(invoice.id, { amount: Number(invoice.totalAmount), method: 'CASH' }, key(), users.managerB);
 const preview = await booking.handlePaidCancellation(customer, reservation.id, 'GET');
 expect(preview).toMatchObject({ state: 'QUOTE', quote: { percent: 100, total: Number(invoice.totalAmount) } });
 await expect(booking.handlePaidCancellation(users.customer, reservation.id, 'GET')).rejects.toThrow();
 await booking.handlePaidCancellation(customer, reservation.id, 'REQUEST', { confirmed: true, confirmation: preview?.quote?.confirmation });
 await expect(booking.handlePaidCancellation(users.managerA, reservation.id, 'APPROVE', { note: 'Review wrong facility' })).rejects.toThrow();
 await expect(booking.handlePaidCancellation(users.managerB, reservation.id, 'APPROVE', { note: 'Paid evidence reviewed' })).resolves.toMatchObject({ state: 'REFUND_PENDING' });
 const refund = { refunded: true, amount: Number(invoice.totalAmount), reference: `TEST-${key()}`, note: 'Cash refund received' };
 await expect(booking.handlePaidCancellation(users.managerB, reservation.id, 'REFUND', refund)).resolves.toMatchObject({ state: 'REFUNDED' });
 await expect(booking.handlePaidCancellation(users.managerB, reservation.id, 'REFUND', refund)).resolves.toMatchObject({ state: 'REFUNDED' });
 expect(await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ status: 'PAID', amountPaid: invoice.totalAmount });
 expect(await db.reservationUnit.count({ where: { reservationId: reservation.id, releasedAt: null } })).toBe(0);
});
it('enforces real two-facility list/detail, customer ownership and five-role boundaries',async()=>{
 const a=await reserve(),b=await reserve('B');
 const invoice=await db.invoice.findFirstOrThrow({where:{reservationId:b.id}});
 expect((await billing.listManagerInvoices({page:1,limit:100},users.managerA)).items.every((i:any)=>i.reservation.id===a.id)).toBe(true);
 await expect(billing.getManagerInvoice(invoice.id,users.managerA)).rejects.toThrow();
 await expect(contracts.getManagerContract((await db.rentalContract.findFirstOrThrow({where:{reservationId:b.id}})).id,users.managerA)).rejects.toThrow();
 await expect(booking.getReservation(users.other,a.id)).rejects.toThrow();
 await expect(booking.getReservation(users.admin,a.id)).rejects.toBeInstanceOf(ForbiddenException);
 await expect(managerService.dashboardSummary(users.bom)).rejects.toBeInstanceOf(ForbiddenException);
 await expect(access.grant(users.managerA,{userId:'staffB',facilityId:'A'})).rejects.toBeInstanceOf(ForbiddenException);
 await expect(ops.list(users.admin)).rejects.toBeInstanceOf(ForbiddenException);
 expect((await ops.list(users.bom)).length).toBe(await db.facility.count());
 await expect(billing.recordPayment(invoice.id,{amount:1,method:'CASH'},key(),users.managerA)).rejects.toBeInstanceOf(ForbiddenException);
 expect(()=>deposits.listManager({page:1,limit:10},users.admin)).toThrow(ForbiddenException);
});
it('preserves two contracts / one initial invoice; OTP, submission, partial payment and future activation are distinct',async()=>{
 const r=await reserve('A',2,date(2));
 const invoice=await db.invoice.findFirstOrThrow({where:{reservationId:r.id}});
 expect(await db.rentalContract.count({where:{reservationId:r.id}})).toBe(2);
 expect(await db.invoice.count({where:{reservationId:r.id,type:'INITIAL'}})).toBe(1);
 await expect(billing.recordPayment(invoice.id,{amount:Number(invoice.totalAmount),method:'CASH'},key(),users.managerA)).rejects.toThrow('hợp đồng');
 await signAll(r.id);
 const notice=await billing.createCustomerPaymentSubmission(users.customer.id,invoice.id,{amount:Number(invoice.totalAmount),reference:'test-bank'},key());
 expect((await db.invoice.findUniqueOrThrow({where:{id:invoice.id}})).amountPaid).toBe(0n);
 await billing.recordPayment(invoice.id,{amount:100000,method:'CASH'},'partial-'+r.id,users.managerA);
 await db.reservation.update({where:{id:r.id},data:{expiresAt:new Date(Date.now()-60000)}});
 await billing.recordPayment(invoice.id,{amount:100000,method:'CASH'},'partial-'+r.id,users.managerA);
 expect(await db.payment.count({where:{invoiceId:invoice.id}})).toBe(1);
 const rest=await db.invoice.findUniqueOrThrow({where:{id:invoice.id}});
 await billing.recordPayment(invoice.id,{amount:Number(rest.balanceDue),method:'CASH'},key(),users.managerA);
 expect(notice.status).toBe('PENDING_VERIFICATION');
 const a=await appointments.createCustomerAppointment(users.customer,{reservationId:r.id,scheduledAt:new Date(Date.now()+60000).toISOString()},key());
 expect(a.status).toBe('REQUESTED');
 await appointments.adjustAppointment(a.id,{action:'CONFIRM_EXCEPTION',expectedScheduledAt:a.scheduledAt,note:'Checked staffing availability'},users.managerA);
 await expect(appointments.assignAppointment(a.id,{staffUserId:'staffB',expectedAssignedStaffUserId:null},users.managerA)).rejects.toThrow();
 await appointments.assignAppointment(a.id,{staffUserId:'staffA',expectedAssignedStaffUserId:null},users.managerA);
 await appointments.assignAppointment(a.id,{staffUserId:'staffA2',expectedAssignedStaffUserId:'staffA'},users.managerA);
 expect(await db.auditEvent.count({where:{resourceId:a.id,action:'TASK_ASSIGNMENT'}})).toBe(2);
 await expect(appointments.completeHandover(a.id,{},users.staffA)).rejects.toThrow();
 const before=(await policies.list(users.bom)).items.find(x=>x.key==='handoverLeadDays')!;
 await policies.save('handoverLeadDays',{value:0,expectedUpdatedAt:before.updatedAt},users.bom);
 await appointments.completeHandover(a.id,{handoverReport:{condition:'Kho trống, sử dụng tốt',accessItemCount:2,identityVerified:true,unitInspected:true,accessDelivered:true,unitChecks:(await db.reservationUnit.findMany({where:{reservationId:r.id}})).map(u=>({unitId:u.storageUnitId,condition:'Kho sạch',inspected:true}))}},users.staffA2);
 expect(await db.rentalContract.count({where:{reservationId:r.id,status:'ACTIVE'}})).toBe(0);
 expect(await db.rentalContract.count({where:{reservationId:r.id,status:'READY_FOR_HANDOVER'}})).toBe(2);
});
it('protects allocation overlap at the database boundary and rejects concurrent double booking',async()=>{
 const unit='B-15';const results=await Promise.allSettled([reserve('B',1,date(3),unit),reserve('B',1,date(3),unit)]);
 expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
 const first=await db.reservationUnit.findFirstOrThrow({where:{storageUnitId:unit,releasedAt:null}});
 await expect(db.reservationUnit.create({data:{reservationId:(await reserve('B',1,date(40))).id,storageUnitId:unit,plannedStartDate:first.plannedStartDate,plannedEndDate:first.plannedEndDate}})).rejects.toThrow();
});
it('blocks stale initial payments, keeps signed snapshots stable and enforces effective pricing ranges',async()=>{
 const r=await reserve('B');await signAll(r.id);
 const invoice=await db.invoice.findFirstOrThrow({where:{reservationId:r.id}});
 await db.reservation.update({where:{id:r.id},data:{status:'EXPIRED',expiresAt:new Date(Date.now()-60000)}});
 await db.reservationUnit.updateMany({where:{reservationId:r.id,releasedAt:null},data:{releasedAt:new Date()}});
 await expect(billing.recordPayment(invoice.id,{amount:Number(invoice.totalAmount),method:'CASH'},key(),users.managerB)).rejects.toThrow();
 expect(await db.payment.count({where:{invoiceId:invoice.id}})).toBe(0);
 const contract=await db.rentalContract.findFirstOrThrow({where:{reservationId:r.id}});
 const effectiveFrom=new Date(Date.now()+60000);
 await ops.saveRange({facilityId:'B',sizeId:'small',min:1000000,max:2000000,effectiveFrom:effectiveFrom.toISOString(),expectedVersion:1},users.bom);
 await expect(resolveMonthlyRange(db,'B','small',new Date(+effectiveFrom-1))).resolves.toEqual({min:1000000,max:2400000});
 await expect(resolveMonthlyRange(db,'B','small',effectiveFrom)).resolves.toEqual({min:1000000,max:2000000});
 expect((await db.rentalContract.findUniqueOrThrow({where:{id:contract.id}})).signedSnapshot).toEqual(contract.signedSnapshot);
});

async function activateRental(customer=users.customer){
 const r=await reserve('A',1,date(),undefined,customer);await signAll(r.id,customer);
 const invoice=await db.invoice.findFirstOrThrow({where:{reservationId:r.id}});
 await billing.recordPayment(invoice.id,{amount:Number(invoice.balanceDue),method:'CASH'},key(),users.managerA);
 const ap=await appointments.createCustomerAppointment(customer,{reservationId:r.id,scheduledAt:new Date(Date.now()+60000).toISOString()},key());
 await appointments.adjustAppointment(ap.id,{action:'CONFIRM_EXCEPTION',expectedScheduledAt:ap.scheduledAt,note:'Checked staffing availability'},users.managerA);
 await appointments.assignAppointment(ap.id,{staffUserId:'staffA',expectedAssignedStaffUserId:null},users.managerA);
 await appointments.completeHandover(ap.id,{handoverReport:{condition:'Kho sạch và trống',accessItemCount:1,identityVerified:true,unitInspected:true,accessDelivered:true}},users.staffA);
 return {r,contract:await db.rentalContract.findFirstOrThrow({where:{reservationId:r.id}})};
}
it('extends a real active rental only after appendix OTP and activation payment',async()=>{
 const {r,contract}=await activateRental(),service=new RenewalsService(db,undefined,signing,new DocumentPolicy(new ConfigService({})));
 const created=await service.createCustomerRenewal(users.customer.id,{reservationId:r.id,rentalContractId:contract.id,termMonths:1,paymentPlan:'PAY_MONTHLY'},key());
 const renewal=await db.renewalRequest.findUniqueOrThrow({where:{id:created.id}});
 expect(renewal.status).toBe('APPROVED_PENDING_PAYMENT');
 expect((await db.rentalContract.findUniqueOrThrow({where:{id:contract.id}})).endDate).toEqual(contract.endDate);
 const invoice=await db.invoice.findFirstOrThrow({where:{renewalRequestId:renewal.id,renewalCycle:1}});
 await expect(billing.recordPayment(invoice.id,{amount:Number(invoice.balanceDue),method:'CASH'},key(),users.managerA)).rejects.toThrow('phụ lục');
 const view=await service.getCustomerRenewal(users.customer.id,renewal.id);
 const input={agreed:true,acceptanceName:users.customer.fullName,signatureImage:signature(),snapshotHash:view.appendix!.snapshotHash};
 const challenge=await service.requestSignatureOtp(users.customer,renewal.id,input);
 await service.acceptCustomerAppendix(users.customer,renewal.id,{...input,challengeId:challenge.challengeId,otp});
 await billing.recordPayment(invoice.id,{amount:Number(invoice.balanceDue),method:'CASH'},key(),users.managerA);
 expect((await db.renewalRequest.findUniqueOrThrow({where:{id:renewal.id}})).status).toBe('COMPLETED');
 expect((await db.rentalContract.findUniqueOrThrow({where:{id:contract.id}})).endDate.getTime()).toBeGreaterThan(contract.endDate.getTime());
 expect((await db.reservationUnit.findUniqueOrThrow({where:{id:contract.reservationUnitId}})).plannedEndDate).toEqual(renewal.requestedEndDate);
});
it('transfers and physically returns a unit without forcing personal-goods stock counting; financial closure stays separate',async()=>{
 const {r,contract}=await activateRental();
 const item=await db.storedItem.create({data:{itemCode:'HIST-'+key(),customerUserId:users.customer.id,rentalContractId:contract.id,name:'Hàng khách tự quản',unit:'thùng',balance:6}});
 const original=await db.rentalContract.findUniqueOrThrow({where:{id:contract.id}});
 const proposal=await support.createCustomer(users.customer,{reservationId:r.id,rentalContractId:contract.id,category:'UNIT_ISSUE',subject:'Yêu cầu chuyển kho',description:'Kho cũ cần kiểm tra khóa.'},key());
 const transfer=await db.transferRequest.findFirstOrThrow({where:{supportRequestId:proposal.id}});
 const destination=(await transfers.destinations(transfer.id,{},users.managerA)).items.find(x=>x.eligible)!;
 await transfers.approve(transfer.id,{toStorageUnitId:destination.id,staffUserId:'staffA'},users.managerA);
 expect((await db.transferRequest.findUniqueOrThrow({where:{id:transfer.id}})).assignedStaffUserId).toBe('staffA');
 await transfers.advanceMove(transfer.id,users.staffA,'DELIVER_DESTINATION',{destinationReady:true,accessDelivered:true});
 await transfers.advanceMove(transfer.id,users.customer,'CUSTOMER_READY');
 await transfers.advanceMove(transfer.id,users.staffA,'START_SOURCE');
 await transfers.complete(transfer.id,users.staffA,{destinationReady:true,oldKeysReturned:true,newKeysDelivered:true,goodsMoved:true,recipientName:users.customer.fullName,returnedKeyCount:1,deliveredKeyCount:1});
 const moved=await db.rentalContract.findUniqueOrThrow({where:{id:contract.id}});
 expect(moved.signedSnapshot).toEqual(original.signedSnapshot);
 expect(moved.endDate).toEqual(original.endDate);
 expect(moved.reservationUnitId).not.toBe(original.reservationUnitId);
 expect((await db.storedItem.findUniqueOrThrow({where:{id:item.id}})).balance).toBe(6);
 expect((await db.maintenanceRequest.findFirstOrThrow({where:{storageUnitId:transfer.fromStorageUnitId}})).assignedStaffUserId).toBeNull();
 const request=await support.createCustomer(users.customer,{reservationId:r.id,rentalContractId:contract.id,category:'OTHER',subject:'Đề nghị trả kho trước hạn',description:'Tôi đã dọn đồ và muốn bàn giao kho.'},key());
 const review=(await returns.listEarlyReturnRequests(1,100,users.managerA)).items.find(x=>x.id===request.id)!;
 await returns.decideEarlyReturn(request.id,{decision:'APPROVED',note:'Đã đối chiếu kỳ thuê, công nợ và cọc.',financialReviewConfirmed:true,reviewedEndDate:review.reservation.effectiveEndDate,reviewedPaidAmount:review.financialSummary.paidAmount,reviewedOutstandingAmount:review.financialSummary.outstandingAmount},users.managerA);
 const returned=await returns.createCustomerReturn(users.customer,{reservationId:r.id,rentalContractId:contract.id},key());
 await returns.assign(returned.id,{staffUserId:'staffA'},users.managerA);
 await returns.startInspection(returned.id,users.staffA);
 const detail=await returns.getStaffReturn(returned.id,users.staffA);
 for(const inspection of detail.inspections)await returns.updateInspection(returned.id,inspection.id,{result:'PASS',conditionNote:'Khách đã dọn hết đồ; kho sạch, khóa tốt.'},users.staffA);
 const scheduled = new Date(Date.now() + 86_400_000);
 const oldRules = await Promise.all([12, 1].map((value, index) => db.businessRule.create({ data: {
   key: 'depositRefundDays', value, version: index + 1, createdById: users.bom.id,
   effectiveFrom: index ? scheduled : new Date(0), effectiveTo: index ? null : scheduled,
 } })));
 await returns.finalize(returned.id,users.staffA,{unitsEmpty:true,accessRevoked:true});
 const actual=await db.returnRequest.findUniqueOrThrow({where:{id:returned.id}});
 expect(actual.physicallyReturnedAt).not.toBeNull();
 expect(actual.status).toBe('PENDING_SETTLEMENT');
 expect((await db.rentalContract.findUniqueOrThrow({where:{id:contract.id}})).status).toBe('COMPLETED');
 const settlement=await db.depositSettlement.findUniqueOrThrow({where:{returnRequestId:returned.id}});
 const due=businessToday(actual.physicallyReturnedAt!);
 due.setUTCDate(due.getUTCDate()+7);
 expect(settlement).toMatchObject({refundDueOn:due,refundPolicyVersion:0,refundedAt:null});
 expect(await deposits.getCustomer(users.customer.id,settlement.id)).toMatchObject({
   refundDueOn:due.toISOString().slice(0,10),refundOverdue:false,refundPolicyVersion:0,
 });
 await expect(deposits.refund(settlement.id,{method:'BANK_TRANSFER'},key(),users.managerA)).rejects.toThrow();
 expect((await db.depositSettlement.findUniqueOrThrow({where:{id:settlement.id}})).refundedAt).toBeNull();
 const historicalDue = new Date(+due + 5 * 86_400_000);
 await db.depositSettlement.update({ where: { id: settlement.id }, data: {
   refundDueOn: historicalDue, refundPolicyVersion: 1, status: 'PENDING_REVIEW', refundAmount: 0n,
 } });
 vi.useFakeTimers({ toFake: ['Date'] });
 vi.setSystemTime(new Date(+historicalDue + 86_400_000));
 try {
   await returns.finalize(returned.id,users.staffA,{unitsEmpty:true,accessRevoked:true});
   expect(await deposits.getCustomer(users.customer.id,settlement.id)).toMatchObject({
     refundDueOn: historicalDue.toISOString().slice(0,10), refundOverdue: true, refundPolicyVersion: 1,
   });
 } finally { vi.useRealTimers(); }
 expect(await db.businessRule.findMany({ where: { key: 'depositRefundDays' }, orderBy: { version: 'asc' } })).toEqual(oldRules);
});
it('VNPay signed callbacks reconcile expired orders without reactivation or duplicate accounting',async()=>{
 const r=await reserve('B');await signAll(r.id);
 const invoice=await db.invoice.findFirstOrThrow({where:{reservationId:r.id}});
 const secret='isolated-foundation-gateway-secret';
 const gateway=new VnpayService(new ConfigService({VNPAY_TMN_CODE:'FOUNDATION',VNPAY_HASH_SECRET:secret,VNPAY_PAYMENT_URL:'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',VNPAY_RETURN_URL:'http://127.0.0.1/customer/payments/vnpay-return'}));
 const online=new OnlinePaymentService(db,billing,gateway);
 const session=await online.create(invoice.id,{},key(),users.customer,'127.0.0.1');
 const transaction=await db.onlinePaymentTransaction.findUniqueOrThrow({where:{id:session.transactionId}});
 await db.reservation.update({where:{id:r.id},data:{status:'EXPIRED',expiresAt:new Date(Date.now()-60000)}});
 const callback:Record<string,string>={vnp_TmnCode:'FOUNDATION',vnp_TxnRef:transaction.merchantOrderRef,vnp_Amount:String(transaction.amount*100n),vnp_ResponseCode:'00',vnp_TransactionStatus:'00',vnp_TransactionNo:'ISOLATED-'+key()};
 callback.vnp_SecureHash=createHmac('sha512',secret).update(Object.keys(callback).sort().map(k=>encodeURIComponent(k)+'='+encodeURIComponent(callback[k]).replace(/%20/g,'+')).join('&')).digest('hex');
 expect((await online.processIpn({...callback,vnp_Amount:'1'})).RspCode).toBe('97');
 expect((await online.processIpn(callback)).RspCode).toBe('00');
 expect((await online.processIpn(callback)).RspCode).toBe('02');
 expect(await db.payment.count({where:{invoiceId:invoice.id}})).toBe(0);
 expect(await db.onlinePaymentReconciliation.count({where:{onlinePaymentTransactionId:transaction.id}})).toBe(1);
 expect((await db.reservation.findUniqueOrThrow({where:{id:r.id}})).status).toBe('EXPIRED');
 const reconciliation=await db.onlinePaymentReconciliation.findUniqueOrThrow({where:{onlinePaymentTransactionId:transaction.id}});
 await expect(online.resolveReconciliation(reconciliation.id,{resolution:'REFUND_REQUIRED',resolutionNote:'Cần hoàn tiền theo giao dịch cổng.'},users.managerA)).rejects.toThrow();
 await online.resolveReconciliation(reconciliation.id,{resolution:'REFUND_REQUIRED',resolutionNote:'Cần hoàn tiền theo giao dịch cổng.'},users.managerB);
 await expect(online.resolveReconciliation(reconciliation.id,{resolution:'RECONCILED',resolutionNote:'Đã xử lý.'},users.managerB)).rejects.toThrow();
});
it('scopes facility offerings without assigning legacy global stock',async()=>{
 const service=new AdditionalServicesService(db),inventory=new AdditionalServiceInventoryService(db);
 const definition={code:'FOUNDATION_BOX',name:'Thùng thử nghiệm',kind:'PURCHASE',billingUnit:'ONE_TIME',physicalUnit:'thùng'};
 await expect(service.create({...definition,unitPrice:10000},users.managerA)).rejects.toThrow('Chỉ điều hành kinh doanh');
 const shared=await service.saveCatalog(undefined,definition,users.bom);
 const addon=await service.configure(shared.id,{facilityId:'A',unitPrice:10000,isActive:true},users.managerA);
 await inventory.update(addon.id,{stockOnHand:10},users.managerA);
 await expect(inventory.update(addon.id,{stockOnHand:999},users.managerB)).rejects.toThrow();
 expect((await inventory.managerList(users.managerB)).some(x=>x.serviceId===addon.id)).toBe(false);
 const legacy=await db.additionalService.create({data:{code:'LEGACY_BOX',name:'Legacy stock',kind:'PURCHASE',billingUnit:'ONE_TIME',unitPrice:10000}});
 await expect(service.managerGet(legacy.id,users.managerA)).rejects.toThrow();
 await service.configure(legacy.id,{facilityId:'B',unitPrice:10000,isActive:true},users.managerB);
 expect((await service.managerGet(legacy.id,users.managerB)).id).toBe(legacy.id);
});

it('requires the current facility configuration revision before accepting new add-ons', async () => {
 const service = new AdditionalServicesService(db);
 const inventory = new AdditionalServiceInventoryService(db);
 const audit = new AuditService(db);
 const shared = await service.saveCatalog(undefined, {
   code: 'FOUNDATION_REVIEW', name: 'Bộ đóng gói', kind: 'PURCHASE', billingUnit: 'ONE_TIME', physicalUnit: 'thùng',
 }, users.bom);
 await service.configure(shared.id, { facilityId: 'A', unitPrice: 10000, isActive: true, stockOnHand: 100 }, users.managerA);
 const quote = { serviceId: shared.id, kind: 'PURCHASE', billingUnit: 'ONE_TIME', physicalUnit: 'thùng', unitPrice: 10000, quantity: 1 };
 const assertAvailable = (selection = quote) => db.$transaction(tx => inventory.assertQuoteAvailable(tx, [selection], 'type-A'));
 await assertAvailable();
 const historicalQuote = { services: [{ ...quote, code: shared.code, name: shared.name, amount: 10000 }] };
 const historical = await db.reservation.create({ data: {
   reservationCode: 'FOUNDATION-ADDON-HISTORY', customerId: users.customer.id, facilityId: 'A', storageTypeId: 'type-A',
   quantity: 1, startDate: new Date('2026-01-01'), endDate: new Date('2026-02-01'), periodMode: 'CUSTOM_DATES',
   availabilitySnapshot: {}, quoteSnapshot: historicalQuote, idempotencyKey: key(), status: 'CONFIRMED',
   services: { create: {
     additionalServiceId: shared.id, serviceCodeSnapshot: shared.code, serviceNameSnapshot: shared.name,
     serviceKindSnapshot: 'PURCHASE', billingUnitSnapshot: 'ONE_TIME', unitPriceSnapshot: 10000,
     quantity: 1, amountSnapshot: 10000, fulfillmentStatus: 'RESERVED',
   } },
 }, include: { services: true } });
 await expect(service.saveCatalog(shared.id, { physicalUnit: 'bộ', expectedUpdatedAt: shared.updatedAt }, users.bom))
   .rejects.toThrow('Còn đơn mua chưa bàn giao');
 const deactivated = await service.saveCatalog(shared.id, { isActive: false, expectedUpdatedAt: shared.updatedAt }, users.bom);
 await expect(assertAvailable()).rejects.toThrow();
 await Promise.all([
   db.$transaction(tx => inventory.fulfillPurchases(tx, historical.id, [historical.services[0].id])),
   db.$transaction(tx => inventory.fulfillPurchases(tx, historical.id, [historical.services[0].id])),
 ]);
 const reactivated = await service.saveCatalog(shared.id, { isActive: true, expectedUpdatedAt: deactivated.updatedAt }, users.bom);
 const renamed = await service.saveCatalog(shared.id, { name: 'Bộ vật tư đóng gói', expectedUpdatedAt: reactivated.updatedAt }, users.bom);
 expect((await service.managerGet(shared.id, users.managerA)).configurationReview).toBeNull();
 const revised = await service.saveCatalog(shared.id, { physicalUnit: 'bộ', expectedUpdatedAt: renamed.updatedAt }, users.bom);
 const pending = await service.managerGet(shared.id, users.managerA);
 expect(pending).toMatchObject({ unitPrice: 10000, stockOnHand: 99, localIsActive: true, isActive: false });
 expect((await service.businessCatalog(users.bom, shared.id)).items[0]).toMatchObject({ offeringFacilityCount: 0 });
 expect((await service.publicCatalog('A')).some(item => item.id === shared.id)).toBe(false);
 await expect(assertAvailable()).rejects.toThrow();
 const notices = await audit.catalogNotices(users.managerA, { page: 1, limit: 100 });
 expect(notices).toMatchObject({ items: expect.arrayContaining([
   expect.objectContaining({ resourceId: shared.id, reviewRequired: true, facilityId: 'A' }),
 ]) });
 expect(await audit.catalogNotices(users.managerB, { page: 1, limit: 100 })).toEqual({ items: [], total: 0, limit: 100 });

 await service.saveCatalog(shared.id, { physicalUnit: 'cái', expectedUpdatedAt: revised.updatedAt }, users.bom);
 const form = { facilityId: 'A', unitPrice: 10000, stockOnHand: 20, isActive: true, reviewRevision: pending.configurationReview.revision };
 await expect(service.update(shared.id, form, users.managerA)).rejects.toThrow('đã thay đổi');
 const latest = await service.managerGet(shared.id, users.managerA);
 expect(latest.configurationReview.before.physicalUnit).toBe('thùng');
 const current = { ...form, reviewRevision: latest.configurationReview.revision };
 await expect(service.update(shared.id, current, users.managerB)).rejects.toThrow();
 await expect(service.update(shared.id, { ...current, stockOnHand: undefined }, users.managerA)).rejects.toThrow('Nhập số lượng');
 await service.update(shared.id, current, users.managerA);
 expect(await service.managerGet(shared.id, users.managerA)).toMatchObject({
   stockOnHand: 20, unitPrice: 10000, configurationReview: null, isActive: true,
 });
 await expect(assertAvailable()).rejects.toThrow('lấy báo giá mới');
 await assertAvailable({ ...quote, physicalUnit: 'cái' });
 const saved = await db.reservation.findUniqueOrThrow({ where: { id: historical.id }, include: { services: true } });
 expect(saved.quoteSnapshot).toEqual(historicalQuote);
 expect(saved.services[0]).toMatchObject({ ...historical.services[0], fulfillmentStatus: 'FULFILLED' });
 expect((await service.businessCatalog(users.bom, shared.id)).items[0]).toMatchObject({ offeringFacilityCount: 1 });
});

it('keeps verified late bank receipts in the shared reconciliation ledger without duplicate rental payments',async()=>{
 const r=await reserve('B');await signAll(r.id);
 const invoice=await db.invoice.findFirstOrThrow({where:{reservationId:r.id}});
 const notice=await billing.createCustomerPaymentSubmission(users.customer.id,invoice.id,{amount:Number(invoice.balanceDue),reference:'CUSTOMER-TEST'},key());
 await db.reservation.update({where:{id:r.id},data:{status:'EXPIRED',expiresAt:new Date(Date.now()-60000)}});
 await db.reservationUnit.updateMany({where:{reservationId:r.id,releasedAt:null},data:{releasedAt:new Date()}});
 await db.invoice.update({where:{id:invoice.id},data:{status:'VOID',balanceDue:0n,voidReason:'Expired test hold',voidedAt:new Date()}});
 const proof={reference:'VERIFIED-BANK-'+key()};
 await expect(billing.verifyPaymentSubmission(notice.id,proof,users.managerA)).rejects.toThrow();
 const verified=await billing.verifyPaymentSubmission(notice.id,proof,users.managerB);
 expect(verified.reconciliation).toMatchObject({status:'PENDING_REVIEW'});
 const next=await reserve('B');await signAll(next.id);
 const nextInvoice=await db.invoice.findFirstOrThrow({where:{reservationId:next.id}});
 await expect(billing.recordPayment(nextInvoice.id,{amount:100,method:'BANK_TRANSFER',reference:proof.reference.toLowerCase()},key(),users.managerB)).rejects.toThrow('Không ghi nhận lại');
 const freshProof='BANK-UNIQUE-'+key();
 await billing.recordPayment(nextInvoice.id,{amount:100,method:'BANK_TRANSFER',reference:freshProof},key(),users.managerB);
 await expect(billing.recordPayment(nextInvoice.id,{amount:100,method:'BANK_TRANSFER',reference:freshProof.toLowerCase()},key(),users.managerB)).rejects.toThrow('Không ghi nhận lại');
 await billing.verifyPaymentSubmission(notice.id,proof,users.managerB);
 expect(await db.payment.count({where:{invoiceId:invoice.id}})).toBe(0);
 expect(await db.onlinePaymentReconciliation.count({where:{paymentSubmissionId:notice.id}})).toBe(1);
 expect((await db.reservation.findUniqueOrThrow({where:{id:r.id}})).status).toBe('EXPIRED');
 expect((await billing.getCustomerPaymentSubmission(users.customer.id,notice.id)).reconciliation).not.toBeNull();
 await expect(billing.getCustomerPaymentSubmission(users.other.id,notice.id)).rejects.toThrow();
});

it('enforces identity-only Admin, BOM-only policies and facility-scoped operational queues on persisted records',async()=>{
 const auth=new AuthService(new PrismaUserRepository(db));
 const input={fullName:'Isolated Staff',email:'created-by-admin@foundation.test',phone:'0900000011',password:'isolated-test-password',role:'FACILITY_STAFF'};
 await expect(auth.createInternalUser(input,users.bom)).rejects.toBeInstanceOf(ForbiddenException);
 const created=await auth.createInternalUser(input,users.admin);
 expect(created.role).toBe('FACILITY_STAFF');
 expect(await db.facilityAccess.count({where:{userId:created.id}})).toBe(0);
 const reporting=new ReportingService(db);
 await expect(reporting.csv({},users.staffA2)).rejects.toBeInstanceOf(ForbiddenException);
 await expect(reporting.csv({},users.admin)).rejects.toBeInstanceOf(ForbiddenException);
 const maintenance=new MaintenanceService(db);
 const vacant=await db.storageUnit.findFirstOrThrow({where:{storageType:{facilityId:'B'},status:'AVAILABLE',reservationUnits:{none:{releasedAt:null}}}});
 const report={storageUnitId:vacant.id,category:'LOCK_OR_ACCESS',description:'Khóa cửa bị kẹt, cần kiểm tra an toàn.'};
 await expect(maintenance.createManual(report,key(),users.staffA2)).rejects.toThrow();
 const issue=await maintenance.createManual(report,key(),users.staffB);
 expect((await db.maintenanceRequest.findUniqueOrThrow({where:{id:issue.id}})).assignedStaffUserId).toBeNull();
 expect((await db.storageUnit.findUniqueOrThrow({where:{id:vacant.id}})).status).toBe('AVAILABLE');
 expect(await db.incidentUnitBlock.count({where:{storageUnitId:vacant.id,releasedAt:null}})).toBe(1);
 await expect(maintenance.getManager(issue.id,users.managerA)).rejects.toThrow();
 expect((await maintenance.listManager({page:1,limit:100},users.managerB)).items.some(row=>row.id===issue.id)).toBe(true);
 const claims=new DamageClaimsService(db);
 const active=await db.rentalContract.findFirstOrThrow({where:{status:'ACTIVE',reservation:{facilityId:'A',customerId:users.customer.id}}});
 const claim=await claims.create(users.customer,{rentalContractId:active.id,description:'Cần kiểm tra dấu hiệu ẩm trong kho đang thuê.',discoveredOn:date(),evidenceLinks:[]},key());
 await expect(claims.get(users.managerB,claim.id)).rejects.toThrow();
 await expect(claims.assign(users.managerA,claim.id,{staffUserId:'staffB'})).rejects.toThrow();
 await claims.assign(users.managerA,claim.id,{staffUserId:'staffA2'});
 expect((await claims.get(users.staffA2,claim.id)).id).toBe(claim.id);
 await expect(claims.get(users.staffB,claim.id)).rejects.toThrow();
 await expect(async()=>support.listManager({page:1,limit:20},users.bom)).rejects.toThrow();
 await expect(async()=>transfers.list({page:1,limit:20},users.admin)).rejects.toThrow();
});

it('expires unpaid holds through the real sweep without erasing original invoice amounts',async()=>{
 const r=await reserve('B');
 const before=await db.invoice.findFirstOrThrow({where:{reservationId:r.id}});
 await db.reservation.update({where:{id:r.id},data:{expiresAt:new Date(Date.now()-60000)}});
 await db.$transaction(tx=>Reflect.get(booking,'expireUnpaidAutomaticReservations').call(booking,tx));
 expect((await db.reservation.findUniqueOrThrow({where:{id:r.id}})).status).toBe('EXPIRED');
 const invoice=await db.invoice.findUniqueOrThrow({where:{id:before.id}});
 expect(invoice.status).toBe('VOID');expect(invoice.balanceDue).toBe(0n);expect(invoice.totalAmount).toBe(before.totalAmount);
 expect(await db.reservationUnit.count({where:{reservationId:r.id,releasedAt:null}})).toBe(0);
 expect(await db.rentalContract.count({where:{reservationId:r.id,status:{not:'CANCELLED'}}})).toBe(0);
});
it('preserves received funds and receipt history on a VOID invoice, without implying a refund',async()=>{
 const r=await reserve('B');await signAll(r.id);
 const invoice=await db.invoice.findFirstOrThrow({where:{reservationId:r.id}});
 await billing.recordPayment(invoice.id,{amount:100000,method:'CASH'},key(),users.managerB);
 const receipts=await db.payment.findMany({where:{invoiceId:invoice.id}});
 // A historical VOID does not reverse a receipt: any actual refund needs its own evidence and workflow.
 await db.invoice.update({where:{id:invoice.id},data:{status:'VOID',balanceDue:0n,voidedAt:new Date(),voidReason:'Isolated historical receipt preservation check'}});
 const after=await db.invoice.findUniqueOrThrow({where:{id:invoice.id}});
 expect(after.totalAmount).toBe(invoice.totalAmount);expect(after.amountPaid).toBe(100000n);
 expect(await db.payment.findMany({where:{invoiceId:invoice.id}})).toEqual(receipts);
 await expect(billing.recordPayment(invoice.id,{amount:100,method:'CASH'},key(),users.managerB)).rejects.toThrow();
 expect((await billing.getManagerInvoice(invoice.id,users.managerB)).amountPaid).toBe(100000);
});

it('issues separate invoices for signed transfer terms and actual late occupancy', async () => {
 const u = await db.user.create({ data: { role: 'STORAGE_CUSTOMER', email: 'adjustments@foundation.test', fullName: 'Policy tenant', passwordHash: 'isolated-only', phone: '' } });
 const customer = { id: u.id, role: u.role, fullName: u.fullName, email: u.email, phone: '' };
 const scheduled = new Date(Date.now() + 86_400_000);
 const oldRules = await Promise.all([35_000, 70_000].map((amount, index) => db.businessRule.create({ data: {
   key: 'transferFee', value: { method: 'FIXED_AMOUNT', amount }, version: index + 1, createdById: users.bom.id,
   effectiveFrom: index ? scheduled : new Date(0), effectiveTo: index ? null : scheduled,
 } })));
 expect((await loadPricingPolicy(db, scheduled)).transferFee).toEqual({ version: 0, value: { method: 'NONE', amount: 0 } });
 const { r, contract } = await activateRental(customer);
 const original = await db.invoice.findFirstOrThrow({ where: { reservationId: r.id, type: 'INITIAL' } });
 const depositPolicy = (await policies.list(users.bom)).pricing.find(policy => policy.key === 'deposit');
 const previous = await db.businessRule.findFirst({
   where: { key: 'deposit', facilityId: null, storageTypeId: null },
   orderBy: { version: 'desc' }, select: { id: true, effectiveTo: true },
 });
 const published = await policies.save('deposit', { value: { ...pricingPolicyDefaults.deposit, other: { method: 'FIXED_AMOUNT', amount: Number(original.depositAmount) + 100_000 } },
   expectedUpdatedAt: depositPolicy?.updatedAt ?? null }, users.bom);
 temporaryDepositRule = { id: published.id, previous };
 const service = new TransfersService(db, new TransferCommercialService(new DocumentPolicy(new ConfigService({}))), signing);
 const proposal = await support.createCustomer(customer, { reservationId: r.id, rentalContractId: contract.id, category: 'OTHER',
   subject: 'Yêu cầu chuyển kho', description: 'Muốn chuyển tới ô thuận tiện hơn.' }, key());
 const transfer = await db.transferRequest.findFirstOrThrow({ where: { supportRequestId: proposal.id } });
 const destination = (await service.destinations(transfer.id, {}, users.managerA)).items.find(item => item.eligible)!;
 const preview = await service.previewCommercial(transfer.id, destination.id, users.managerA);
 expect(preview).toMatchObject({ snapshot: { adjustmentTerms: { fee: 0, amountDue: 100_000, refundAmount: 0, depositAdjustment: 100_000 } } });
 await service.approve(transfer.id, { toStorageUnitId: destination.id, staffUserId: 'staffA', commercialReviewHash: preview.reviewHash }, users.managerA);
 const details = await service.getCustomerOrder(customer, transfer.id);
 const acceptance = { agreed: true, acceptanceName: customer.fullName, signatureImage: signature(), snapshotHash: details.commercial!.snapshotHash };
 const challenge = await service.requestCommercialOtp(customer, transfer.id, acceptance);
 await service.acceptCommercial(customer, transfer.id, { ...acceptance, challengeId: challenge.challengeId, otp });
 const handover = { destinationReady: true, oldKeysReturned: true, newKeysDelivered: true, goodsMoved: true,
   recipientName: customer.fullName, returnedKeyCount: 1, deliveredKeyCount: 1 };
 await service.complete(transfer.id, users.staffA, handover);
 await service.complete(transfer.id, users.staffA, handover);
 expect(await db.invoice.findUniqueOrThrow({ where: { invoiceCode: `${transfer.transferCode}-FINANCE` } })).toMatchObject({ chargeAmount: 100_000n });

 const vacated = new Date(+contract.endDate + 2 * 86_400_000).toISOString().slice(0, 10);
 vi.useFakeTimers({ toFake: ['Date'] });
 vi.setSystemTime(new Date(+contract.endDate + 4 * 86_400_000));
 try {
   const result = await returns.createCustomerReturn(customer, { reservationId: r.id, rentalContractId: contract.id }, key());
   await returns.assign(result.id, { staffUserId: 'staffA' }, users.managerA);
   await returns.startInspection(result.id, users.staffA);
   for (const inspection of (await returns.getStaffReturn(result.id, users.staffA)).inspections) {
     await returns.updateInspection(result.id, inspection.id, { result: 'PASS', conditionNote: 'Kho đã dọn sạch' }, users.staffA);
   }
   const facts = { unitsEmpty: true, accessRevoked: true, physicalReturnDate: vacated, physicalReturnEvidence: 'Biên bản ký khi nhận kho' };
   await returns.finalize(result.id, users.staffA, facts);
   await returns.finalize(result.id, users.staffA, facts);
   const invoice = await db.invoice.findUniqueOrThrow({ where: { invoiceCode: `${result.returnCode}-OCCUPANCY` } });
   expect(invoice.chargeAmount).toBe(100_000n);
   expect(invoice.facilityIdSnapshot).toBe('A');
   expect(await db.invoice.findUnique({ where: { invoiceCode: `${transfer.transferCode}-FINANCE-BALANCE` } })).toBeNull();
   expect(await db.depositSettlement.findUniqueOrThrow({ where: { returnRequestId: result.id } })).toMatchObject({ depositAmount: original.depositAmount });
 } finally { vi.useRealTimers(); }
 expect(await db.invoice.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({ status: 'PAID', totalAmount: original.totalAmount });
 expect(await db.businessRule.findMany({ where: { key: 'transferFee' }, orderBy: { version: 'asc' } })).toEqual(oldRules);
});
