import type { PublicUser } from '../auth/auth.types.js';
import { assertActiveRole } from '../facility-access/record-access.js';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
export const policyDefinitions = {
 reservationHoldMinutes: { title:'Thời hạn giữ đơn chưa thanh toán',unit:'phút',defaultValue:1440,min:15,max:10080,description:'Áp dụng cho đơn xác nhận mới; giữ nguyên hạn của đơn đã tạo.' },
 handoverLeadDays: { title:'Nhận chìa khóa trước ngày thuê',unit:'ngày',defaultValue:3,min:0,max:7,description:'Không thay đổi lịch đã đặt; chỉ kích hoạt hợp đồng từ ngày bắt đầu thuê.' },
} as const;
export function validatePolicy(key:string,value:unknown) {
 if(!Object.hasOwn(policyDefinitions,key))throw new BadRequestException('Thông số này chưa được phê duyệt để cấu hình.');
 const d=policyDefinitions[key as keyof typeof policyDefinitions];
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<d.min||value>d.max)throw new BadRequestException('Nhập số nguyên từ '+d.min+' đến '+d.max+' '+d.unit+'.');
 return value;
}
@Injectable()
export class BusinessPolicyService {
 constructor(private readonly prisma:PrismaService) {}
 async value(key:keyof typeof policyDefinitions,db:PrismaService|Prisma.TransactionClient=this.prisma,asOf=new Date()) {
  const now=asOf;
  const version=await db.businessRule.findFirst({where:{key,facilityId:null,storageTypeId:null,effectiveFrom:{lte:now},OR:[{effectiveTo:null},{effectiveTo:{gt:now}}]},orderBy:{version:'desc'}});
  if(version)return validatePolicy(key,version.value);
  const row=await db.businessPolicy.findUnique({where:{key}});
  return row && row.updatedAt<=asOf?validatePolicy(key,row.value):policyDefinitions[key].defaultValue;
 }
 async list(actor:PublicUser) {
  await assertActiveRole(this.prisma,actor,'BUSINESS_OPERATIONS_MANAGER');
  const legacy=await this.prisma.businessPolicy.findMany();
  const history=await this.prisma.businessRule.findMany({where:{key:{in:Object.keys(policyDefinitions)}},orderBy:{version:'desc'}});
  const items=await Promise.all(Object.entries(policyDefinitions).map(async([key,d])=>{
   const versions=history.filter(r=>r.key===key);
   const row=legacy.find(r=>r.key===key);
   return {key,...d,value:await this.value(key as keyof typeof policyDefinitions),updatedAt:versions[0]?.createdAt.toISOString()??row?.updatedAt.toISOString()??null,version:versions[0]?.version??0,history:versions};
  }));
  return {items};
 }
 async save(key:string,body:Record<string,unknown>,actor:PublicUser) {
  const value=validatePolicy(key,body.value);
  if(!Object.hasOwn(body,'expectedUpdatedAt')||Object.keys(body).some(k=>!['value','expectedUpdatedAt','effectiveFrom'].includes(k)))throw new BadRequestException('Cần gửi giá trị và phiên bản đã xem.');
  if(body.effectiveFrom!==undefined&&typeof body.effectiveFrom!=='string')throw new BadRequestException('Ngày áp dụng không hợp lệ.');
  const effectiveFrom=body.effectiveFrom===undefined?new Date():new Date(body.effectiveFrom as string);
  if(!Number.isFinite(effectiveFrom.getTime())||effectiveFrom.getTime()<Date.now()-60000)throw new BadRequestException('Ngày áp dụng phải từ hiện tại trở đi.');
  return this.prisma.$transaction(async tx=>{
   await assertActiveRole(tx,actor,'BUSINESS_OPERATIONS_MANAGER');
   await tx.$queryRawUnsafe('SELECT 1 FROM pg_advisory_xact_lock(hashtext($1))','policy:'+key);
   const old=await tx.businessPolicy.findUnique({where:{key}});
   const last=await tx.businessRule.findFirst({where:{key,facilityId:null,storageTypeId:null},orderBy:{version:'desc'}});
   if((last?.createdAt.toISOString()??old?.updatedAt.toISOString()??null)!==body.expectedUpdatedAt)throw new ConflictException('Thông số vừa thay đổi. Tải lại trước khi lưu.');
   if(last&&last.effectiveFrom>=effectiveFrom)throw new ConflictException('Ngày áp dụng phải sau phiên bản trước.');
   if(last)await tx.businessRule.update({where:{id:last.id},data:{effectiveTo:effectiveFrom}});
   return tx.businessRule.create({data:{id:randomUUID(),key,version:(last?.version??0)+1,value,effectiveFrom,createdById:actor.id}});
  });
 }
}
