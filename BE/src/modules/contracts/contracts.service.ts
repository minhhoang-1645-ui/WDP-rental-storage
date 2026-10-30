import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublicUser } from '../auth/auth.types.js';
import { snapshotHash, validateSignature } from './signature.js';
import { SigningOtpService, signedDocument, signedEnvelope, signatureVerification } from '../signing/signing-otp.service.js';
import { DocumentPolicy } from '../documents/document-policy.js';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../guest-booking/email.service.js';

export interface ContractListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: 'PENDING_PAYMENT' | 'READY_FOR_HANDOVER' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
}

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService, private readonly signing: SigningOtpService = new SigningOtpService(new EmailService(new ConfigService())), private readonly policy: DocumentPolicy = new DocumentPolicy(new ConfigService())) {}

  async requestSignatureOtp(customer: PublicUser, id: string, input: Record<string, unknown>) {
    const contract = await this.getCustomerContract(customer.id, id);
    if (contract.terms.acceptedAt || contract.status === 'CANCELLED') throw new ConflictException('Hợp đồng đã ký hoặc đã hủy. Vui lòng tải lại.');
    const signatureImage = validateSignature(input);
    const acceptanceName = typeof input.acceptanceName === 'string' ? input.acceptanceName.trim() : '';
    if (acceptanceName.length < 2 || acceptanceName.length > 120) throw new BadRequestException('Họ tên xác nhận phải dài 2–120 ký tự.');
    if (input.snapshotHash !== contract.terms.snapshotHash) throw new ConflictException('Nội dung hợp đồng đã thay đổi. Vui lòng tải lại trước khi ký.');
    return this.signing.issue({ userId: customer.id, email: customer.email, kind: 'contract', documentId: contract.id, documentHash: contract.terms.snapshotHash, signatureImage, acceptanceName }, `hợp đồng ${contract.contractCode}`);
  }

  async ensureForConfirmedReservation(tx: Prisma.TransactionClient, reservationId: string) {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: {
        units: { include: { storageUnit: true }, orderBy: { id: 'asc' } },
      },
    });
    if (!reservation || reservation.status !== 'CONFIRMED') {
      throw new ConflictException('Chỉ Reservation CONFIRMED mới được tạo RentalContract.');
    }
    if (reservation.units.length !== reservation.quantity) {
      throw new ConflictException('Reservation CONFIRMED phải có đủ ReservationUnit trước khi tạo RentalContract.');
    }

    const units = [...reservation.units].sort((first, second) => first.storageUnit.unitNumber.localeCompare(second.storageUnit.unitNumber) || first.id.localeCompare(second.id));
    for (const [index, unit] of units.entries()) {
      await tx.rentalContract.upsert({
        where: { reservationUnitId: unit.id },
        update: {},
        create: {
          contractCode: `${reservation.reservationCode}-C${String(index + 1).padStart(2, '0')}`,
          reservationId: reservation.id,
          reservationUnitId: unit.id,
          status: 'PENDING_PAYMENT',
          startDate: reservation.startDate,
          endDate: reservation.endDate,
        },
      });
    }
  }

  async listCustomerContracts(customerId: string, query: Pick<ContractListQuery, 'page' | 'limit'>) {
    const where: Prisma.RentalContractWhereInput = { reservation: { customerId } };
    const total = await this.prisma.rentalContract.count({ where });
    const contracts = await this.prisma.rentalContract.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: this.contractInclude(),
    });
    return { page: query.page, limit: query.limit, total, items: contracts.map((contract) => this.toContract(contract, false)) };
  }

  async getCustomerContract(customerId: string, id: string) {
    const contract = await this.prisma.rentalContract.findFirst({
      where: { OR: [{ id }, { contractCode: id }], reservation: { customerId } },
      include: this.contractInclude(),
    });
    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng.');
    return this.toContract(contract, true);
  }

  async acceptCustomerContract(customer: PublicUser, id: string, input: Record<string, unknown>) {
    if (customer.role !== 'CUSTOMER') throw new ForbiddenException('Chỉ Customer được xác nhận hợp đồng của mình.');
    const acceptanceName = typeof input.acceptanceName === 'string' ? input.acceptanceName.trim() : '';
    const acceptanceNote = typeof input.acceptanceNote === 'string' ? input.acceptanceNote.trim() : '';
    if (acceptanceName.length < 2 || acceptanceName.length > 120) throw new BadRequestException('Họ tên xác nhận phải dài 2–120 ký tự.');
    if (acceptanceNote.length > 500) throw new BadRequestException('Ghi chú xác nhận không được vượt quá 500 ký tự.');
    const identity = await this.prisma.rentalContract.findFirst({ where: { OR: [{ id }, { contractCode: id }], reservation: { customerId: customer.id } }, select: { id: true } });
    if (!identity) throw new NotFoundException('Không tìm thấy hợp đồng thuộc tài khoản này.');
    const contract = await this.prisma.rentalContract.findUnique({ where: { id: identity.id }, include: this.contractInclude() });
    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng.');
    if (contract.status === 'CANCELLED') throw new ConflictException('Không thể xác nhận hợp đồng đã hủy.');
    if (contract.termsAcceptedAt) {
      if (contract.termsAcceptedByUserId !== customer.id) throw new ConflictException('Hợp đồng đã được xác nhận bởi tài khoản khác.');
      return this.toContract(contract, true);
    }
    const signatureImage = validateSignature(input);
    const snapshot = this.documentSnapshot(contract);
    if (input.snapshotHash !== snapshotHash(snapshot)) throw new ConflictException('Nội dung hợp đồng đã thay đổi. Vui lòng tải lại và kiểm tra trước khi ký.');
    const proof = this.signing.acquire({ userId: customer.id, email: customer.email, kind: 'contract', documentId: contract.id, documentHash: snapshotHash(snapshot), signatureImage, acceptanceName }, input);
    try {
      const changed = await this.prisma.rentalContract.updateMany({ where: { id: contract.id, termsAcceptedAt: null, updatedAt: contract.updatedAt, status: { not: 'CANCELLED' } }, data: { termsVersion: snapshot.version, termsAcceptedAt: new Date(), termsAcceptedByUserId: customer.id, acceptanceName, acceptanceNote: acceptanceNote || null, signedSnapshot: signedEnvelope(snapshot, proof.evidence) as unknown as Prisma.InputJsonValue, signatureImage } });
      if (changed.count !== 1) throw new ConflictException('Hợp đồng vừa được cập nhật. Vui lòng tải lại.');
      proof.commit();
    } catch (error) { proof.release(); throw error; }
    const updated = await this.prisma.rentalContract.findUniqueOrThrow({ where: { id: contract.id }, include: this.contractInclude() });
    return this.toContract(updated, true);
  }

  async listManagerContracts(query: ContractListQuery) {
    const where: Prisma.RentalContractWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? {
        OR: [
          { contractCode: { contains: query.search, mode: 'insensitive' } },
          { reservation: { reservationCode: { contains: query.search, mode: 'insensitive' } } },
          { reservation: { customer: { fullName: { contains: query.search, mode: 'insensitive' } } } },
          { reservation: { customer: { email: { contains: query.search, mode: 'insensitive' } } } },
          { reservationUnit: { storageUnit: { unitNumber: { contains: query.search, mode: 'insensitive' } } } },
        ],
      } : {}),
    };
    const total = await this.prisma.rentalContract.count({ where });
    const contracts = await this.prisma.rentalContract.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: this.contractInclude(),
    });
    return { page: query.page, limit: query.limit, total, items: contracts.map((contract) => this.toContract(contract, true)) };
  }

  async getManagerContract(id: string) {
    const contract = await this.prisma.rentalContract.findFirst({
      where: { OR: [{ id }, { contractCode: id }] },
      include: this.contractInclude(),
    });
    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng.');
    return this.toContract(contract, true);
  }

  private contractInclude() {
    return {
      reservation: {
        include: {
          customer: { select: { id: true, fullName: true, email: true, phone: true } },
          storageType: { select: { id: true, code: true, name: true, sizeId: true, sizeName: true, condition: true } },
          services: true,
        },
      },
      reservationUnit: { include: { storageUnit: { select: { id: true, unitNumber: true, floor: true, zone: true, row: true, position: true, status: true } } } },
    };
  }

  private toContract(contract: any, includeCustomer: boolean) {
    const reservation = contract.reservation;
    const storageUnit = contract.reservationUnit.storageUnit;
    return {
      id: contract.id,
      contractCode: contract.contractCode,
      status: contract.status,
      startDate: this.isoDate(contract.startDate),
      endDate: this.isoDate(contract.endDate),
      reservation: {
        id: reservation.id,
        reference: reservation.reservationCode,
        status: reservation.status,
        quantity: reservation.quantity,
        ...(includeCustomer ? { customer: { id: reservation.customer.id, fullName: reservation.customer.fullName, email: reservation.customer.email, phone: reservation.customer.phone ?? '' } } : {}),
      },
      storageType: reservation.storageType,
      storageUnit: {
        id: storageUnit.id,
        unitCode: storageUnit.unitNumber,
        floor: storageUnit.floor,
        zone: storageUnit.zone,
        row: storageUnit.row,
        position: storageUnit.position,
        physicalStatus: storageUnit.status,
      },
      reservationPricing: reservation.quoteSnapshot,
      services: reservation.services.map((service: any) => ({ code: service.serviceCodeSnapshot, name: service.serviceNameSnapshot, kind: service.serviceKindSnapshot, billingUnit: service.billingUnitSnapshot, unitPrice: Number(service.unitPriceSnapshot), quantity: service.quantity, serviceStartDate: service.serviceStartDate?.toISOString().slice(0, 10) ?? null, serviceEndDate: service.serviceEndDate?.toISOString().slice(0, 10) ?? null, amount: Number(service.amountSnapshot) })),
      createdAt: contract.createdAt.toISOString(),
      updatedAt: contract.updatedAt.toISOString(),
      activatedAt: contract.activatedAt?.toISOString() ?? null,
      completedAt: contract.completedAt?.toISOString() ?? null,
      terms: {
        version: signedDocument(contract.signedSnapshot)?.version ?? (contract.termsAcceptedAt ? contract.termsVersion : this.policy.issuer().termsVersion),
        acceptedAt: contract.termsAcceptedAt?.toISOString() ?? null,
        acceptanceName: contract.acceptanceName ?? null,
        acceptanceNote: contract.acceptanceNote ?? null,
        document: signedDocument(contract.signedSnapshot) ?? this.documentSnapshot(contract),
        snapshotHash: snapshotHash(signedDocument(contract.signedSnapshot) ?? this.documentSnapshot(contract)),
        verification: signatureVerification(contract.signedSnapshot),
        otp: this.signing.availability(),
        signatureImage: contract.signatureImage ?? null,
      },
    };
  }

  private isoDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private documentSnapshot(contract: any) {
    const reservation = contract.reservation;
    return {
      documentType: 'RENTAL_CONTRACT', version: contract.termsAcceptedAt ? contract.termsVersion : this.policy.issuer().termsVersion, contractCode: contract.contractCode,
      ...(contract.termsAcceptedAt ? { issuer: { brand: 'NestBox Storage', draft: true }, legacySnapshotUnavailable: true } : { issuer: this.policy.issuer(), clauses: this.policy.terms() }),
      reservationReference: reservation.reservationCode, customer: { fullName: reservation.customer.fullName, email: reservation.customer.email, phone: reservation.customer.phone ?? null },
      storage: { name: reservation.storageType.name, unitCode: contract.reservationUnit.storageUnit.unitNumber },
      startDate: this.isoDate(contract.startDate), endDate: this.isoDate(contract.endDate),
      quantity: reservation.quantity, pricing: reservation.quoteSnapshot,
      services: reservation.services.map((service: any) => ({ name: service.serviceNameSnapshot, billingUnit: service.billingUnitSnapshot, quantity: service.quantity, amount: Number(service.amountSnapshot) })),
    };
  }
}
