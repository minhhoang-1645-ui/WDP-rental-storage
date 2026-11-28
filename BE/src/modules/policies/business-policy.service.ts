import type { PublicUser } from '../auth/auth.types.js';
import { assertActiveRole } from '../facility-access/record-access.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { DEPOSIT_REFUND_DAYS, pricingPolicyDefaults, pricingPolicyValidators, returnNoticeRange, type PricingPolicyKey } from './pricing-policy.js';
export const policyDefinitions = {
 reservationHoldMinutes: { title:'Thời hạn giữ đơn chưa thanh toán',unit:'phút',defaultValue:1440,min:15,max:10080,description:'Áp dụng cho đơn xác nhận mới; giữ nguyên hạn của đơn đã tạo.' },
 handoverLeadDays: { title:'Nhận chìa khóa trước ngày thuê',unit:'ngày',defaultValue:3,min:0,max:7,description:'Không thay đổi lịch đã đặt; chỉ kích hoạt hợp đồng từ ngày bắt đầu thuê.' },
 renewalReminderDays: { title:'Nhắc hợp đồng sắp hết hạn',unit:'ngày',defaultValue:7,min:1,max:30,description:'Hiển thị lời nhắc trong hộp thông báo trước khi hợp đồng hết hiệu lực.' },
 paymentReminderDays: { title:'Nhắc trước hạn thanh toán',unit:'ngày',defaultValue:3,min:1,max:30,description:'Hiển thị lời nhắc cho hóa đơn còn dư nợ và đang nhận thanh toán.' },
 returnNoticeDays: { title:'Báo trước khi trả kho',unit:'ngày',...returnNoticeRange,description:'Thông báo để bố trí lịch trả kho. Báo muộn không phát sinh phí khi trả đúng hạn.' },
} as const;
export const pricingDefinitions = {
 deposit: { title: 'Đặt cọc khi thuê kho', description: 'Tính cọc theo loại kho và kỳ thuê khi lập báo giá mới.' },
 prepaid: { title: 'Giảm giá thanh toán trước', description: 'Chỉ giảm trên tiền thuê trả trước đủ điều kiện.' },
 renewal: { title: 'Gia hạn hợp đồng', description: 'Thiết lập khoảng thời gian gửi yêu cầu và đơn giá cho kỳ gia hạn mới.' },
 earlyReturn: { title: 'Quyết toán trả kho trước hạn', description: 'Áp dụng theo điều khoản trên báo giá mới. Phí tính theo mức cố định hoặc phần tiền thuê chưa sử dụng, được miễn khi NestBox phải thu hồi kho.' },
 paymentOverdue: { title: 'Quá hạn thanh toán', description: 'Thời gian cho phép quá hạn, thời điểm báo quản lý và phí một lần trên phần tiền thuê còn nợ theo điều khoản đã cam kết.' },
 cancellation: { title: 'Hủy đơn đã thanh toán', description: 'Các mốc hoàn tiền thuê theo ngày khách gửi yêu cầu và hạn xử lý khoản hoàn.' },
 returnOverdue: { title: 'Quá hạn trả kho', description: 'Thời gian cho phép quá hạn và hệ số phí sử dụng đến ngày bàn giao thực tế.' },
};
export function validatePolicy(key:string,value:unknown) {
 if(!Object.hasOwn(policyDefinitions,key))throw new BadRequestException('Thông số này chưa được phê duyệt để cấu hình.');
 const d=policyDefinitions[key as keyof typeof policyDefinitions];
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<d.min||value>d.max)throw new BadRequestException('Nhập số nguyên từ '+d.min+' đến '+d.max+' '+d.unit+'.');
 return value;
}
@Injectable()
export class BusinessPolicyService {
 constructor(private readonly prisma:PrismaService) {}
 async resolve(key:keyof typeof policyDefinitions,db:PrismaService|Prisma.TransactionClient=this.prisma,asOf=new Date()) {
  const now=asOf;
  const version=await db.businessRule.findFirst({where:{key,facilityId:null,storageTypeId:null,effectiveFrom:{lte:now},OR:[{effectiveTo:null},{effectiveTo:{gt:now}}]},orderBy:{version:'desc'}});
  if(version)return { value: validatePolicy(key,version.value), version: version.version };
  const row=key==='reservationHoldMinutes'||key==='handoverLeadDays' ? await db.businessPolicy.findUnique({where:{key}}) : null;
  return { value: row && row.updatedAt<=asOf?validatePolicy(key,row.value):policyDefinitions[key].defaultValue, version: 0 };
 }
 async value(key:keyof typeof policyDefinitions,db:PrismaService|Prisma.TransactionClient=this.prisma,asOf=new Date()) {
  return (await this.resolve(key, db, asOf)).value;
 }
 async list(actor:PublicUser) {
  await assertActiveRole(this.prisma,actor,'BUSINESS_OPERATIONS_MANAGER');
  return this.catalog();
 }
 async applied(actor:PublicUser) {
  if (actor.role !== 'STORAGE_CUSTOMER' && actor.role !== 'FACILITY_MANAGER') throw new ForbiddenException();
  await assertActiveRole(this.prisma,actor,actor.role);
  const catalog = await this.catalog(false);
  const manager = actor.role === 'FACILITY_MANAGER';
  return {
   items: catalog.items.map(({key,title,description,value,unit,effectiveVersion,effectiveFrom,isDefault}) => ({
    key,title,description,value,unit,effectiveVersion,
    effectiveFrom: manager || effectiveVersion > 0 ? effectiveFrom : null,
    isDefault,
   })),
   pricing: catalog.pricing.map(({key,title,description,value,effectiveVersion,effectiveFrom,isDefault}) => ({
    key,title,description: !manager && key === 'paymentOverdue' ? 'Thời gian cho phép quá hạn và phí một lần theo điều khoản đã cam kết.' : description,
    value: manager || !('managerDays' in value) ? value : Object.fromEntries(Object.entries(value).filter(([name]) => name !== 'managerDays')),
    effectiveVersion,effectiveFrom,isDefault,
   })),
   ...(manager ? { depositRefundDays: DEPOSIT_REFUND_DAYS } : {}),
  };
 }
 async customerApplied(actor: PublicUser) {
  await assertActiveRole(this.prisma, actor, 'STORAGE_CUSTOMER');
  const catalog = await this.catalog(false);
  const items = catalog.items.map(({ key, value, unit, effectiveFrom, isDefault }) => ({ key, value, unit, effectiveFrom, isDefault }));
  const pricing = catalog.pricing.map(({ key, value, effectiveFrom, isDefault }) => {
   if ('managerDays' in value) {
    const { managerDays: _, ...customerValue } = value;
    return { key, value: customerValue, effectiveFrom, isDefault };
   }
   return { key, value, effectiveFrom, isDefault };
  });
  return { items, pricing, depositRefundDays: DEPOSIT_REFUND_DAYS };
 }
 async staffApplied(actor: PublicUser) {
  await assertActiveRole(this.prisma, actor, 'FACILITY_STAFF');
  const grants = await this.prisma.facilityAccess.findMany({
   where: { userId: actor.id, revokedAt: null },
   select: { facility: { select: { name: true } } },
  });

  const now = new Date();
  const numericKeys = ['handoverLeadDays', 'returnNoticeDays', 'renewalReminderDays', 'paymentReminderDays'] as const;
  const pricingKeys = ['renewal', 'paymentOverdue', 'returnOverdue'] as const;
  const keys = [...numericKeys, ...pricingKeys];
  const [rules, legacyHandover] = await Promise.all([this.prisma.businessRule.findMany({
   where: { key: { in: keys }, facilityId: null, storageTypeId: null },
   orderBy: { effectiveFrom: 'asc' },
   select: { key: true, version: true, value: true, effectiveFrom: true, effectiveTo: true },
  }), this.prisma.businessPolicy.findUnique({ where: { key: 'handoverLeadDays' } })]);
  function operationalValue(key: string, value: unknown) {
   if (key in policyDefinitions) return validatePolicy(key, value);
   if (key === 'renewal') {
    const { opensDaysBefore, closesDaysBefore } = pricingPolicyValidators.renewal(value);
    return { opensDaysBefore, closesDaysBefore };
   }
   const { graceDays, managerDays } = key === 'paymentOverdue'
    ? pricingPolicyValidators.paymentOverdue(value) : pricingPolicyValidators.returnOverdue(value);
   return { graceDays, managerDays };
  }
  const entries = keys.map(key => {
   const numeric = key in policyDefinitions ? policyDefinitions[key as keyof typeof policyDefinitions] : undefined;
   const title = numeric?.title ?? pricingDefinitions[key as PricingPolicyKey].title;
   const versions = rules.filter(rule => rule.key === key);
   const current = versions.filter(rule => rule.effectiveFrom <= now && (!rule.effectiveTo || rule.effectiveTo > now)).at(-1);
   const legacy = key === 'handoverLeadDays' && legacyHandover && legacyHandover.updatedAt <= now ? legacyHandover : null;
   const baseline = legacy?.value ?? numeric?.defaultValue ?? pricingPolicyDefaults[key as PricingPolicyKey];
   return { key, title, value: operationalValue(key, current?.value ?? baseline),
    effectiveVersion: current?.version ?? 0, effectiveFrom: current?.effectiveFrom ?? legacy?.updatedAt ?? null,
    isDefault: !current && !legacy };
  });
  const updates = entries.flatMap(entry => {
   const versions = rules.filter(rule => rule.key === entry.key);
   return versions.flatMap((rule, index) => {
    if (rule.version !== entry.effectiveVersion && rule.effectiveFrom <= now) return [];
    const previous = versions[index - 1];
    const baseline = previous?.value ?? (entry.key in pricingPolicyDefaults ? pricingPolicyDefaults[entry.key as PricingPolicyKey] : null);
    const oldValue = baseline === null ? null : operationalValue(entry.key, baseline);
    const value = operationalValue(entry.key, rule.value);
    if (oldValue !== null && JSON.stringify(oldValue) === JSON.stringify(value)) return [];
    return [{ key: entry.key, title: entry.title, version: rule.version,
     effectiveFrom: rule.effectiveFrom, scheduled: rule.effectiveFrom > now, oldValue, value }];
   });
  });
  return { entries, updates, facilities: grants.map(grant => grant.facility.name) };
 }
 private async catalog(includeHistory = true) {
  const now = new Date();
  const legacy=await this.prisma.businessPolicy.findMany();
  const history=await this.prisma.businessRule.findMany({where:{key:{in:[...Object.keys(policyDefinitions), ...Object.keys(pricingDefinitions)]},facilityId:null,storageTypeId:null,
   ...(includeHistory ? {} : {effectiveFrom:{lte:now},OR:[{effectiveTo:null},{effectiveTo:{gt:now}}]})},orderBy:{version:'desc'}});
  const authors=includeHistory ? await this.prisma.user.findMany({where:{id:{in:[...new Set(history.map(row=>row.createdById))]}},select:{id:true,fullName:true}}) : [];
  const items=Object.entries(policyDefinitions).map(([key,d])=>{
   const versions=history.filter(r=>r.key===key);
   const row=legacy.find(r=>r.key===key);
   const effective=versions.find(v=>v.effectiveFrom<=now&&(!v.effectiveTo||v.effectiveTo>now));
   const legacyEffective = row && (key === 'reservationHoldMinutes' || key === 'handoverLeadDays') && row.updatedAt <= now ? row : null;
   return {key,...d,value:effective ? validatePolicy(key,effective.value) : legacyEffective ? validatePolicy(key,legacyEffective.value) : d.defaultValue,
    updatedAt:versions[0]?.createdAt.toISOString()??row?.updatedAt.toISOString()??null,version:versions[0]?.version??0,
    effectiveVersion:effective?.version??0,effectiveFrom:effective?.effectiveFrom??legacyEffective?.updatedAt??null,
    isDefault:!effective&&!legacyEffective,history:versions.map(describeVersion)};
  });
  function describeVersion(v: (typeof history)[number]) {
   return { ...v, author: authors.find(a=>a.id===v.createdById)?.fullName??null,
    status: v.effectiveFrom>now?'SCHEDULED':v.effectiveTo&&v.effectiveTo<=now?'HISTORICAL':'EFFECTIVE' };
  }
  const pricing = (Object.keys(pricingDefinitions) as PricingPolicyKey[]).map(key => {
   const versions = history.filter(row => row.key === key);
   const effective = versions.find(row => row.effectiveFrom <= now && (!row.effectiveTo || row.effectiveTo > now));
   return { key, ...pricingDefinitions[key], defaultValue: pricingPolicyDefaults[key],
    value: effective ? pricingPolicyValidators[key](effective.value) : pricingPolicyDefaults[key],
    updatedAt: versions[0]?.createdAt.toISOString() ?? null, version: versions[0]?.version ?? 0,
    effectiveVersion: effective?.version ?? 0, effectiveFrom: effective?.effectiveFrom ?? null, isDefault: !effective, history: versions.map(describeVersion) };
  });
  return {items, pricing};
 }
 async save(key:string,body:Record<string,unknown>,actor:PublicUser) {
  const structured=Object.hasOwn(pricingPolicyValidators,key);
  const value=structured ? pricingPolicyValidators[key as PricingPolicyKey](body.value) : validatePolicy(key,body.value);
  if(!Object.hasOwn(body,'expectedUpdatedAt')||Object.keys(body).some(k=>!['value','expectedUpdatedAt','effectiveFrom'].includes(k)))throw new BadRequestException('Cần gửi giá trị và phiên bản đã xem.');
  if(body.effectiveFrom!==undefined&&(typeof body.effectiveFrom!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(body.effectiveFrom)))throw new BadRequestException('Ngày áp dụng cần có múi giờ rõ ràng.');
  const scheduled=body.effectiveFrom===undefined?null:new Date(body.effectiveFrom as string);
  if(scheduled && (!Number.isFinite(scheduled.getTime()) || scheduled.getTime() < Date.now()))throw new BadRequestException('Ngày áp dụng phải từ hiện tại trở đi.');
  return this.prisma.$transaction(async tx=>{
   await assertActiveRole(tx,actor,'BUSINESS_OPERATIONS_MANAGER');
   await tx.$queryRawUnsafe('SELECT 1 FROM pg_advisory_xact_lock(hashtext($1))','policy:'+key);
   const effectiveFrom=scheduled ?? new Date();
   if(scheduled && +scheduled < Date.now()) throw new ConflictException('Ngày áp dụng đã qua. Chọn thời điểm mới.');
   const old=structured ? null : await tx.businessPolicy.findUnique({where:{key}});
   const last=await tx.businessRule.findFirst({where:{key,facilityId:null,storageTypeId:null},orderBy:{version:'desc'}});
   if((last?.createdAt.toISOString()??old?.updatedAt.toISOString()??null)!==body.expectedUpdatedAt)throw new ConflictException('Thông số vừa thay đổi. Tải lại trước khi lưu.');
   if(last&&last.effectiveFrom>=effectiveFrom)throw new ConflictException('Ngày áp dụng phải sau phiên bản trước.');
   if(last)await tx.businessRule.update({where:{id:last.id},data:{effectiveTo:effectiveFrom}});
   return tx.businessRule.create({data:{id:randomUUID(),key,version:(last?.version??0)+1,value,effectiveFrom,createdById:actor.id}});
  });
 }
}
