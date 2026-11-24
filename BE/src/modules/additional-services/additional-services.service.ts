import type { PublicUser } from '../auth/auth.types.js';
import {
  assertFacility,
  facilityIds,
} from '../facility-access/facility-access.service.js';
import {
  assertActiveRole,
  managerReservationScope,
} from '../facility-access/record-access.js';
import { serviceUnits } from './service-units.js';
import { localizeService } from './additional-service-labels.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  offeringView,
  publicOfferingScope,
  explicitPrice,
} from './service-offerings.js';
@Injectable()
export class AdditionalServicesService {
  constructor(private readonly prisma: PrismaService) {}
  async publicCatalog(facilityId?: string) {
    const offers = await this.prisma.facilityServiceOffering.findMany({
      where: { ...publicOfferingScope, ...(facilityId ? { facilityId } : {}) },
      include: { additionalService: true },
      orderBy: [{ additionalService: { name: 'asc' } }, { facilityId: 'asc' }],
    });
    return offers.map((o) => this.view(offeringView(o)));
  }
  async catalog(actor: PublicUser) {
    if (actor.role === 'BUSINESS_OPERATIONS_MANAGER')
      await assertActiveRole(this.prisma, actor, 'BUSINESS_OPERATIONS_MANAGER');
    else {
      managerReservationScope(actor);
      await facilityIds(this.prisma, actor);
    }
    if(actor.role==='BUSINESS_OPERATIONS_MANAGER') {
      const rows=await this.prisma.additionalService.findMany({orderBy:{code:'asc'},include:{offerings:{include:{facility:{select:{id:true,name:true,code:true}}}}}});
      return rows.map(o=>({...this.view({...o,facilityId:null,unitPrice:null},true),offerings:o.offerings.map(x=>({facility:x.facility,isActive:x.isActive,unitPrice:x.unitPrice===null?null:Number(x.unitPrice),stockOnHand:x.stockOnHand,rentalCapacity:x.rentalCapacity}))}));
    }
    return (await this.prisma.additionalService.findMany({ orderBy: { code: 'asc' } })).map((o) => this.view({ ...o, facilityId: null, unitPrice: null }, true));
  }
  async managerList(actor: PublicUser) {
    managerReservationScope(actor);
    const ids = await facilityIds(this.prisma, actor);
    return (
      await this.prisma.facilityServiceOffering.findMany({
        where: { facilityId: { in: ids } },
        include: { additionalService: true },
        orderBy: { createdAt: 'desc' },
      })
    ).map((o) => this.view(offeringView(o), true));
  }
  async managerGet(id: string, actor: PublicUser, facilityId?: string) {
    managerReservationScope(actor);
    const ids = await facilityIds(this.prisma, actor);
    const offers = await this.prisma.facilityServiceOffering.findMany({
      where: {
        facilityId: { in: ids, ...(facilityId ? { equals: facilityId } : {}) },
        additionalService: { OR: [{ id }, { code: id }] },
      },
      include: { additionalService: true },
    });
    if (!offers.length)
      throw new NotFoundException('Dịch vụ chưa được cấu hình tại cơ sở.');
    if (offers.length !== 1)
      throw new BadRequestException('Chọn cơ sở của dịch vụ.');
    return this.view(offeringView(offers[0]), true);
  }
  async configure(
    id: string,
    input: Record<string, unknown>,
    actor: PublicUser,
  ) {
    managerReservationScope(actor);
    const ids = await facilityIds(this.prisma, actor);
    const facilityId =
      typeof input.facilityId === 'string'
        ? input.facilityId
        : ids.length === 1
          ? ids[0]
          : undefined;
    if (!facilityId)
      throw new BadRequestException('Chọn cơ sở cung cấp dịch vụ.');
    if (
      Object.keys(input).some(
        (k) => !['facilityId', 'unitPrice', 'isActive'].includes(k),
      )
    )
      throw new BadRequestException(
        'Chỉ cập nhật giá và trạng thái cung cấp tại cơ sở.',
      );
    const unitPrice = explicitPrice(input.unitPrice);
    if (input.isActive !== undefined && typeof input.isActive !== 'boolean')
      throw new BadRequestException('Trạng thái cung cấp không hợp lệ.');
    return this.prisma.$transaction(async (tx) => {
      await assertFacility(tx, actor, facilityId);
      const item = await tx.additionalService.findFirst({
        where: { OR: [{ id }, { code: id }] },
      });
      if (!item)
        throw new NotFoundException('Không tìm thấy dịch vụ trong danh mục.');
      if (!item.isActive && input.isActive===true) throw new ConflictException('Dịch vụ đã bị tắt trong danh mục chung. Không thể mở cung cấp mới.');
      const offer = await tx.facilityServiceOffering.upsert({
        where: {
          additionalServiceId_facilityId: {
            additionalServiceId: item.id,
            facilityId,
          },
        },
        create: {
          additionalServiceId: item.id,
          facilityId,
          unitPrice,
          isActive: input.isActive === true,
        },
        update: {
          unitPrice,
          ...(input.isActive !== undefined
            ? { isActive: input.isActive as boolean }
            : {}),
        },
        include: { additionalService: true },
      });
      return this.view(offeringView(offer), true);
    });
  }
  async create(_input: Record<string, unknown>, actor: PublicUser): Promise<ReturnType<AdditionalServicesService['view']>> {
    managerReservationScope(actor);
    throw new ForbiddenException('Chỉ điều hành kinh doanh được tạo dịch vụ trong danh mục chung. Hãy chọn dịch vụ có sẵn để cung cấp tại cơ sở.');
  }
  async update(id: string, input: Record<string, unknown>, actor: PublicUser) {
    const current = await this.managerGet(
      id,
      actor,
      typeof input.facilityId === 'string' ? input.facilityId : undefined,
    );
    return this.configure(
      id,
      {
        facilityId: current.facilityId,
        unitPrice: input.unitPrice ?? current.unitPrice,
        ...input,
      },
      actor,
    );
  }
  async saveCatalog(
    id: string | undefined,
    input: Record<string, unknown>,
    actor: PublicUser,
  ) {
    if (
      Object.keys(input).some((k) =>
        ['facilityId', 'unitPrice', 'stockOnHand', 'rentalCapacity'].includes(
          k,
        ),
      )
    )
      throw new BadRequestException(
        'Giá và tồn kho được cấu hình riêng tại cơ sở.',
      );
    return this.prisma.$transaction(async (tx) => {
      await assertActiveRole(tx, actor, 'BUSINESS_OPERATIONS_MANAGER');
      await tx.$queryRawUnsafe('SELECT 1 FROM pg_advisory_xact_lock(hashtext($1))','shared-service-catalog');
      const current = id
        ? await tx.additionalService.findUnique({ where: { id } })
        : null;
      if (id && !current) throw new NotFoundException();
      if(current && input.expectedUpdatedAt!==current.updatedAt.toISOString())throw new ConflictException('Dịch vụ vừa thay đổi. Vui lòng tải lại.');
      const data = this.parse(input, !!id, current ?? undefined, true);
      if(current && (input.code!==undefined&&input.code!==current.code || input.billingUnit!==undefined&&input.billingUnit!==current.billingUnit))throw new ConflictException('Không đổi mã hoặc chu kỳ tính tiền của dịch vụ đã tạo.');
      delete data.unitPrice;
      const item = id
        ? await tx.additionalService.update({
            where: { id },
            data: data as any,
          })
        : await tx.additionalService.create({
            data: { ...data, unitPrice: null } as any,
          });
      return this.view({ ...item, facilityId: null, unitPrice: null }, true);
    });
  }
  private parse(
    input: Record<string, unknown>,
    partial: boolean,
    current?: {
      kind: string;
      billingUnit: string;
      physicalUnit?: string | null;
    },
    catalogOnly = false,
  ) {
    const data: Record<string, unknown> = {};
    if (
      partial &&
      current &&
      input.kind !== undefined &&
      input.kind !== current.kind
    )
      throw new ConflictException(
        'Không đổi loại mua/thuê của dịch vụ đã tạo; cần tạo dịch vụ mới.',
      );
    if (input.physicalUnit !== undefined) {
      if (
        typeof input.physicalUnit !== 'string' ||
        !serviceUnits.some((unit) => unit === input.physicalUnit)
      )
        throw new BadRequestException(
          'Chọn đơn vị vật lý trong danh mục chuẩn.',
        );
      if (current?.physicalUnit && current.physicalUnit !== input.physicalUnit)
        throw new ConflictException(
          'Không đổi đơn vị vật lý đã thiết lập; tạo dịch vụ mới để tránh đổi nghĩa tồn và lịch sử.',
        );
      data.physicalUnit = input.physicalUnit;
    }
    const required = (key: string) => !partial || input[key] !== undefined;
    if (required('code')) {
      const code =
        typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
      if (!/^[A-Z0-9_-]{2,50}$/.test(code))
        throw new BadRequestException('code không hợp lệ.');
      data.code = code;
    }
    if (required('name')) {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (name.length < 2 || name.length > 120)
        throw new BadRequestException('name không hợp lệ.');
      data.name = name;
    }
    if (input.description !== undefined) {
      if (
        input.description !== null &&
        (typeof input.description !== 'string' ||
          input.description.trim().length > 1000)
      )
        throw new BadRequestException('description không hợp lệ.');
      data.description =
        typeof input.description === 'string' && input.description.trim()
          ? input.description.trim()
          : null;
    }
    if (required('kind')) {
      if (!['PURCHASE', 'RENTAL'].includes(String(input.kind)))
        throw new BadRequestException('kind phải là PURCHASE hoặc RENTAL.');
      data.kind = input.kind;
    }
    if (required('billingUnit')) {
      if (!['ONE_TIME', 'DAY', 'MONTH'].includes(String(input.billingUnit)))
        throw new BadRequestException(
          'billingUnit phải là ONE_TIME, DAY hoặc MONTH.',
        );
      data.billingUnit = input.billingUnit;
    }
    const kind =
      typeof data.kind === 'string' ? data.kind : (current?.kind ?? '');
    const billingUnit =
      typeof data.billingUnit === 'string'
        ? data.billingUnit
        : (current?.billingUnit ?? '');
    if (
      (kind === 'PURCHASE' && billingUnit !== 'ONE_TIME') ||
      (kind === 'RENTAL' && !['DAY', 'MONTH'].includes(billingUnit))
    )
      throw new BadRequestException({
        code: 'INVALID_ADDITIONAL_SERVICE_BILLING_UNIT',
        message:
          'PURCHASE phải dùng ONE_TIME; RENTAL phải dùng DAY hoặc MONTH.',
      });
    if (!catalogOnly && required('unitPrice')) {
      const price = Number(input.unitPrice);
      if (!Number.isSafeInteger(price) || price <= 0)
        throw new BadRequestException(
          'unitPrice phải là số VND nguyên lớn hơn 0.',
        );
      data.unitPrice = BigInt(price);
    }
    if (input.imageUrl !== undefined) {
      if (
        input.imageUrl !== null &&
        (typeof input.imageUrl !== 'string' || input.imageUrl.length > 2000)
      )
        throw new BadRequestException('imageUrl không hợp lệ.');
      data.imageUrl =
        typeof input.imageUrl === 'string' && input.imageUrl.trim()
          ? input.imageUrl.trim()
          : null;
    }
    if (input.imageAlt !== undefined) {
      if (
        input.imageAlt !== null &&
        (typeof input.imageAlt !== 'string' || input.imageAlt.length > 300)
      )
        throw new BadRequestException('imageAlt không hợp lệ.');
      data.imageAlt =
        typeof input.imageAlt === 'string' && input.imageAlt.trim()
          ? input.imageAlt.trim()
          : null;
    }
    if (input.isActive !== undefined) {
      if (typeof input.isActive !== 'boolean')
        throw new BadRequestException('isActive phải là boolean.');
      data.isActive = input.isActive;
    }
    if (partial && Object.keys(data).length === 0)
      throw new BadRequestException('Không có trường hợp lệ để cập nhật.');
    return data;
  }

  private view(raw: any, internal = false) {
    const item = localizeService(raw);
    return {
      id: item.id,
      facilityId: item.facilityId ?? null,
      offeringId: item.offeringId,
      code: item.code,
      name: item.name,
      description: item.description,
      kind: item.kind,
      billingUnit: item.billingUnit,
      physicalUnit: item.physicalUnit ?? null,
      unitPrice: item.unitPrice === null ? null : Number(item.unitPrice),
      imageUrl: item.imageUrl,
      imageAlt: item.imageAlt,
      ...(internal
        ? {
            isActive: item.isActive,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          }
        : {}),
    };
  }
}
