import { randomUUID } from 'node:crypto';
import { businessToday } from '../../business-date.js';
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
import { Prisma } from '../../generated/prisma/client.js';
import {
  availablePublicOfferings,
  committedOfferingQuantities,
  eligibleServiceFacility,
  MAX_OFFERING_QUANTITY,
  offeringKey,
  offeringQuantity,
  offeringView,
  explicitPrice,
} from './service-offerings.js';
const structuralFields = ['kind', 'billingUnit', 'physicalUnit'] as const;

function definition(item: Record<(typeof structuralFields)[number], string | null>) {
  return { kind: item.kind, billingUnit: item.billingUnit, physicalUnit: item.physicalUnit };
}

type ConfigurationReview = {
  revision: string;
  before: ReturnType<typeof definition>;
  after: ReturnType<typeof definition>;
};

async function structureBlockReason(tx: Prisma.TransactionClient, id: string) {
  const obligation = await tx.reservationService.findFirst({
    where: {
      additionalServiceId: id,
      reservation: { status: { in: ['PENDING', 'CONFIRMED'] } },
      OR: [
        { serviceKindSnapshot: 'PURCHASE', OR: [
          { reservation: { status: 'PENDING' } }, { fulfillmentStatus: null }, { fulfillmentStatus: 'RESERVED' },
        ] },
        { serviceKindSnapshot: 'RENTAL', OR: [
          { reservation: { status: 'PENDING' } }, { serviceEndDate: null }, { serviceEndDate: { gt: businessToday() } },
        ] },
      ],
    },
    select: { serviceKindSnapshot: true },
  });
  if (obligation?.serviceKindSnapshot === 'PURCHASE')
    return 'Còn đơn mua chưa bàn giao. Có thể sửa sau khi bàn giao hoặc giải phóng số lượng đã giữ.';
  if (obligation)
    return 'Còn lượt thuê chưa kết thúc. Có thể sửa sau khi các lượt thuê kết thúc hoặc được hủy.';
  return null;
}

@Injectable()
export class AdditionalServicesService {
  constructor(private readonly prisma: PrismaService) {}
  async publicCatalog(facilityId?: string) {
    const offers = await availablePublicOfferings(this.prisma, facilityId);
    return offers.map((o) => this.view(offeringView(o)));
  }
  async catalog(actor: PublicUser) {
    managerReservationScope(actor);
    await facilityIds(this.prisma, actor);
    const rows = await this.prisma.additionalService.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
    return rows.map((o) =>
      this.view({ ...o, facilityId: null, unitPrice: null }, true),
    );
  }

  async businessCatalog(actor: PublicUser, id?: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await assertActiveRole(tx, actor, 'BUSINESS_OPERATIONS_MANAGER');
        const [facilities, items] = await Promise.all([
          tx.facility.findMany({
            select: {
              id: true,
              name: true,
              code: true,
              bookingEnabled: true,
              operationalStatus: true,
            },
            orderBy: { name: 'asc' },
          }),
          tx.additionalService.findMany({
            where: id ? { id } : {},
            orderBy: { code: 'asc' },
            include: { offerings: { include: { additionalService: true } } },
          }),
        ]);
        if (id && !items.length)
          throw new NotFoundException('Không tìm thấy mục trong danh mục.');
        const eligibleIds = new Set(
          facilities
            .filter(
              (f) =>
                f.bookingEnabled &&
                f.operationalStatus ===
                  eligibleServiceFacility.operationalStatus,
            )
            .map((f) => f.id),
        );
        const committed = await committedOfferingQuantities(
          tx,
          id ? items.flatMap((item) =>
            item.offerings.filter(
              (offer) => (offeringQuantity(offer) ?? 0) > 0,
            ),
          ) : [],
          true,
        );

        const blockReason = id ? await structureBlockReason(tx, id) : null;
        return {
          facilityCount: facilities.length,
          eligibleFacilityCount: eligibleIds.size,
          items: items.map((item) => {
            const offers = new Map(
              item.offerings.map((offer) => [offer.facilityId, offer]),
            );
            const offeringFacilityCount = item.isActive
              ? [...offers.values()].filter(offer => offer.isActive && !offer.configurationReview && eligibleIds.has(offer.facilityId)).length
              : 0;
            const rows = id ? facilities.map((facility) => {
              const offer = offers.get(facility.id);
              const review = offer?.configurationReview as ConfigurationReview | null | undefined;
              const quantity = offer && !review ? offeringQuantity(offer) : null;
              const availableQuantity =
                quantity === null
                  ? null
                  : Math.max(
                      0,
                      quantity -
                        (committed.get(offeringKey(item.id, facility.id)) ?? 0),
                    );
              let status = 'AVAILABLE';
              if (!offer) status = 'NOT_CONFIGURED';
              else if (review) status = 'REVIEW_REQUIRED';
              else if (!item.isActive) status = 'GLOBALLY_DISABLED';
              else if (!offer.isActive) status = 'LOCALLY_DISABLED';
              else if (!eligibleIds.has(facility.id))
                status = 'FACILITY_UNAVAILABLE';
              else if ((offer.unitPrice ?? 0n) <= 0n)
                status = 'PRICE_UNAVAILABLE';
              else if (availableQuantity === null)
                status = 'INVENTORY_UNCONFIGURED';
              else if (availableQuantity === 0) status = 'QUANTITY_UNAVAILABLE';
              return {
                facility,
                status,
                localIsActive: offer?.isActive ?? null,
                unitPrice: offer?.unitPrice?.toString() ?? null,
                quantity,
                availableQuantity,
                previousConfiguration: review && offer ? {
                  ...review.before,
                  quantity: review.before.kind === 'PURCHASE' ? offer.stockOnHand : offer.rentalCapacity,
                } : null,
              };
            }) : undefined;
            return {
              ...this.view(
                { ...item, facilityId: null, unitPrice: null },
                true,
              ),
              name: item.name,
              description: item.description,
              configuredFacilityCount: offers.size,
              offeringFacilityCount,
              ...(rows ? { offerings: rows, canEditStructure: !blockReason, structureBlockReason: blockReason } : {}),
            };
          }),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async managerList(actor: PublicUser) {
    managerReservationScope(actor);
    const ids = await facilityIds(this.prisma, actor);
    return (
      await this.prisma.facilityServiceOffering.findMany({
        where: { facilityId: { in: ids } },
        include: {
          additionalService: true,
          facility: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    ).map((o) => ({
      ...this.view(offeringView(o), true),
      facilityName: o.facility.name,
    }));
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
    creating = true,
    catalogUpdatedAt?: string,
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
    const fields = ['facilityId', 'unitPrice', 'isActive'];
    if (!creating) fields.push('reviewRevision');
    if (creating) fields.push('expectedCatalogUpdatedAt');
    if (creating || input.reviewRevision !== undefined) fields.push('stockOnHand', 'rentalCapacity');
    if (Object.keys(input).some((k) => !fields.includes(k)))
      throw new BadRequestException(
        creating
          ? 'Dữ liệu thêm dịch vụ tại cơ sở có trường không được hỗ trợ.'
          : input.reviewRevision !== undefined
            ? 'Dữ liệu xác nhận cấu hình có trường không được hỗ trợ.'
            : 'Chỉ sửa giá và trạng thái cung cấp tại đây. Dùng chức năng cập nhật số lượng để đổi tồn kho hoặc số thiết bị.',
      );
    const legacyCatalogUpdatedAt = input.expectedCatalogUpdatedAt;
    if (legacyCatalogUpdatedAt !== undefined && typeof legacyCatalogUpdatedAt !== 'string')
      throw new BadRequestException('Phiên bản danh mục không hợp lệ.');
    if (catalogUpdatedAt !== undefined && legacyCatalogUpdatedAt !== undefined && catalogUpdatedAt !== legacyCatalogUpdatedAt)
      throw new BadRequestException('Các phiên bản danh mục gửi lên không khớp.');
    const expectedCatalogUpdatedAt = catalogUpdatedAt ?? legacyCatalogUpdatedAt;
    const unitPrice = explicitPrice(input.unitPrice);
    if (input.isActive !== undefined && typeof input.isActive !== 'boolean')
      throw new BadRequestException('Trạng thái cung cấp không hợp lệ.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await assertFacility(tx, actor, facilityId);
        // Read the definition after locking it so a new offering cannot use an outdated category.
        await tx.$queryRawUnsafe(
          'SELECT id FROM "AdditionalService" WHERE id = $1 OR code = $1 ORDER BY id FOR UPDATE',
          id,
        );
        const item = await tx.additionalService.findFirst({
          where: { OR: [{ id }, { code: id }] },
        });
        if (!item)
          throw new NotFoundException('Không tìm thấy dịch vụ trong danh mục.');
        if (creating && expectedCatalogUpdatedAt !== undefined &&
          expectedCatalogUpdatedAt !== item.updatedAt.toISOString())
          throw new ConflictException('Danh mục chung vừa thay đổi. Vui lòng tải lại trước khi cấu hình.');
        const key = { additionalServiceId: item.id, facilityId };
        const where = { additionalServiceId_facilityId: key };
        const include = { additionalService: true } as const;
        const isActive = input.isActive as boolean | undefined;
        const current = creating
          ? null
          : await tx.facilityServiceOffering.findUnique({ where });
        if (!creating && !current)
          throw new NotFoundException('Dịch vụ chưa được cấu hình tại cơ sở.');
        const review = current?.configurationReview as ConfigurationReview | null | undefined;
        if ((review?.revision ?? undefined) !== input.reviewRevision)
          throw new ConflictException('Cấu hình cần rà soát đã thay đổi. Vui lòng tải lại và xác nhận phiên bản hiện tại.');
        if (!item.isActive && (creating || (isActive && !current?.isActive)))
          throw new ConflictException(
            'Mục này đã tắt toàn hệ thống. Vui lòng chờ kích hoạt lại.',
          );
        const field =
          item.kind === 'PURCHASE' ? 'stockOnHand' : 'rentalCapacity';
        const otherField =
          item.kind === 'PURCHASE' ? 'rentalCapacity' : 'stockOnHand';
        const quantity = input[field];
        if (
          input[otherField] !== undefined ||
          (quantity !== undefined &&
            (typeof quantity !== 'number' ||
              !Number.isInteger(quantity) ||
              quantity < 0 ||
              quantity > MAX_OFFERING_QUANTITY))
        )
          throw new BadRequestException(
            'Số lượng phải là số nguyên không âm và đúng với loại sản phẩm hoặc thiết bị.',
          );
        if (review && quantity === undefined)
          throw new BadRequestException('Nhập số lượng áp dụng theo cấu hình mới.');
        const offer = creating
          ? await tx.facilityServiceOffering.create({
              data: {
                ...key,
                unitPrice,
                isActive,
                ...(quantity === undefined ? {} : { [field]: quantity }),
              },
              include,
            })
          : await tx.facilityServiceOffering.update({
              where,
              data: {
                unitPrice, isActive,
                ...(review ? { [field]: quantity, configurationReview: Prisma.DbNull } : {}),
              },
              include,
            });
        if (review && current) {
          await tx.auditEvent.create({ data: {
            category: 'ACTIVITY', outcome: 'SUCCESS', action: 'CONFIRM_OFFERING_CONFIGURATION',
            actorId: actor.id, actorRole: actor.role, actorName: actor.fullName,
            resource: 'facility-service-offering', resourceId: offer.id,
            route: '/manager/additional-services/:id', method: 'PATCH', httpStatus: 200,
            metadata: { facilityId, revision: review.revision, quantityField: field,
              before: { price: current.unitPrice?.toString() ?? null, quantity: current[field], active: current.isActive },
              after: { price: unitPrice.toString(), quantity: offer[field], active: offer.isActive } },
          } });
        }
        return this.view(offeringView(offer), true);
      });
    } catch (error) {
      if (
        creating &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Cơ sở đã có mục này. Hãy chỉnh sửa cấu hình hiện có.',
        );
      throw error;
    }
  }
  async create(
    _input: Record<string, unknown>,
    actor: PublicUser,
  ): Promise<ReturnType<AdditionalServicesService['view']>> {
    managerReservationScope(actor);
    throw new ForbiddenException(
      'Chỉ điều hành kinh doanh được tạo dịch vụ trong danh mục chung. Hãy chọn dịch vụ có sẵn để cung cấp tại cơ sở.',
    );
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
        unitPrice: input.reviewRevision === undefined ? input.unitPrice ?? current.unitPrice : input.unitPrice,
        ...input,
      },
      actor,
      false,
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
      await tx.$queryRawUnsafe(
        'SELECT 1 FROM pg_advisory_xact_lock(hashtext($1))',
        'shared-service-catalog',
      );
      // FOR UPDATE also conflicts with foreign-key inserts on this catalog item.
      if (id) await tx.$queryRawUnsafe('SELECT id FROM "AdditionalService" WHERE id = $1 FOR UPDATE', id);
      const current = id
        ? await tx.additionalService.findUnique({ where: { id }, include: { offerings: true } })
        : null;
      if (id && !current)
        throw new NotFoundException('Không tìm thấy mục trong danh mục.');
      if (
        current &&
        input.expectedUpdatedAt !== current.updatedAt.toISOString()
      )
        throw new ConflictException('Dịch vụ vừa thay đổi. Vui lòng tải lại.');
      if (current && input.code !== undefined && input.code !== current.code)
        throw new ConflictException('Không đổi mã sản phẩm/dịch vụ đã tạo.');
      const data = this.parse(input, !!id, current ?? undefined);
      const changes = current ? Object.entries(data)
        .filter(([field, value]) => value !== current[field as keyof typeof current])
        .map(([field, after]) => ({ field, before: current[field as keyof typeof current], after })) : [];
      if (current && !changes.length)
        return this.view({ ...current, facilityId: null, unitPrice: null }, true);
      const structural = structuralFields.some(field => changes.some(change => change.field === field));
      if (current && structural) {
        const reason = await structureBlockReason(tx, current.id);
        if (reason) throw new ConflictException(reason);
      }
      if (
        !current &&
        (await tx.additionalService.findUnique({
          where: { code: data.code as string },
          select: { id: true },
        }))
      )
        throw new ConflictException('Mã sản phẩm/dịch vụ đã tồn tại.');
      const item = id
        ? await tx.additionalService.update({
            where: { id },
            data: data as any,
          })
        : await tx.additionalService.create({
            data: { ...data, unitPrice: null } as any,
          });
      if (current) {
        const revision = randomUUID();
        if (structural) {
          for (const offer of current.offerings) {
            const prior = offer.configurationReview as ConfigurationReview | null;
            await tx.facilityServiceOffering.update({
              where: { id: offer.id },
              data: { configurationReview: { revision, before: prior?.before ?? definition(current), after: definition(item) } },
            });
          }
        }
        const notify = changes.some(({ field }) => field !== 'description' && field !== 'imageUrl' && field !== 'imageAlt');
        const grants = notify && current.offerings.length ? await tx.facilityAccess.findMany({
          where: { facilityId: { in: current.offerings.map(offer => offer.facilityId) },
            revokedAt: null, user: { role: 'FACILITY_MANAGER', accountStatus: 'ACTIVE' } },
          select: { userId: true, facilityId: true },
        }) : [];
        await tx.auditEvent.create({ data: {
          category: 'ACTIVITY', outcome: 'SUCCESS', action: 'UPDATE_SHARED_SERVICE_CATALOG',
          actorId: actor.id, actorName: actor.fullName, actorRole: actor.role,
          resource: 'shared-service-catalog', resourceId: item.id,
          method: 'PATCH', route: '/operations/additional-services/:id', httpStatus: 200,
          metadata: {
            code: item.code, name: item.name,
            changes: changes as Prisma.InputJsonValue,
            recipientIds: [...new Set(grants.map(grant => grant.userId))],
            grants,
            reviewFacilityIds: current.offerings.filter(offer => structural ||
              (item.isActive && Boolean(offer.configurationReview) && changes.some(change => change.field === 'isActive')),
            ).map(offer => offer.facilityId),
          },
        } });
      }
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
  ) {
    const data: Record<string, unknown> = {};
    if (input.physicalUnit !== undefined) {
      if (input.physicalUnit !== null &&
        (typeof input.physicalUnit !== 'string' || !serviceUnits.some(unit => unit === input.physicalUnit)))
        throw new BadRequestException('Chọn đơn vị vật lý trong danh mục chuẩn.');
      data.physicalUnit = input.physicalUnit;
    }
    const required = (key: string) => !partial || input[key] !== undefined;
    if (!partial) {
      const code =
        typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
      if (!/^[A-Z0-9_-]{2,50}$/.test(code))
        throw new BadRequestException(
          'Mã phải có 2–50 ký tự gồm chữ cái, chữ số, dấu gạch ngang hoặc gạch dưới.',
        );
      data.code = code;
    }
    if (required('name')) {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (name.length < 2 || name.length > 120)
        throw new BadRequestException(
          'Tên sản phẩm/dịch vụ phải có 2–120 ký tự.',
        );
      data.name = name;
    }
    if (input.description !== undefined) {
      if (
        input.description !== null &&
        (typeof input.description !== 'string' ||
          input.description.trim().length > 1000)
      )
        throw new BadRequestException('Mô tả tối đa 1.000 ký tự.');
      data.description =
        typeof input.description === 'string' && input.description.trim()
          ? input.description.trim()
          : null;
    }
    if (required('kind')) {
      if (input.kind !== 'PURCHASE' && input.kind !== 'RENTAL')
        throw new BadRequestException(
          'Chọn sản phẩm tiêu hao hoặc thiết bị cho thuê.',
        );
      data.kind = input.kind;
    }
    if (required('billingUnit')) {
      if (input.billingUnit !== 'ONE_TIME' && input.billingUnit !== 'DAY' && input.billingUnit !== 'MONTH')
        throw new BadRequestException('Chọn hình thức tính phí hợp lệ.');
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
          'Sản phẩm tiêu hao tính phí một lần. Thiết bị cho thuê tính phí theo ngày hoặc theo tháng.',
      });
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
        throw new BadRequestException('Trạng thái toàn hệ thống không hợp lệ.');
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
            localIsActive: item.localIsActive as boolean | undefined,
            globalIsActive: item.globalIsActive as boolean | undefined,
            configurationReview: raw.inventory?.configurationReview ?? null,
            stockOnHand: raw.inventory?.stockOnHand ?? null,
            rentalCapacity: raw.inventory?.rentalCapacity ?? null,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          }
        : {}),
    };
  }
}
