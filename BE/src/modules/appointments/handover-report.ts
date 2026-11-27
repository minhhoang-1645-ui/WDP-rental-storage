import { BadRequestException } from '@nestjs/common';
import { evidencePhotos } from '../../evidence-photos.js';

type PhysicalUnit = { id: string; unitNumber: string };

export type UnitHandover = { unitId: string; unitCode: string; condition: string; inspected: true; completedAt: string; staffUserId: string };

export function readUnitHandoverDraft(value: unknown): { unitProgress: UnitHandover[]; activityUpdatedAt?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { unitProgress: [] };
  const draft = value as Record<string, unknown>;
  const unitProgress = Array.isArray(draft.unitProgress) ? draft.unitProgress.filter((unit): unit is UnitHandover =>
    unit?.inspected === true && typeof unit.unitId === 'string' && typeof unit.unitCode === 'string'
    && typeof unit.condition === 'string' && typeof unit.staffUserId === 'string'
    && typeof unit.completedAt === 'string' && Number.isFinite(Date.parse(unit.completedAt))) : [];
  return { unitProgress, ...(typeof draft.activityUpdatedAt === 'string' ? { activityUpdatedAt: draft.activityUpdatedAt } : {}) };
}

function checkedUnits(report: Record<string, unknown>, units: readonly PhysicalUnit[]) {
  if (report.unitChecks === undefined) return undefined;
  if (!Array.isArray(report.unitChecks) || units.length === 0 || report.unitChecks.length !== units.length) {
    throw new BadRequestException('Cần ghi kết quả kiểm tra cho từng kho trong lịch.');
  }
  const checks = new Map<string, string>();
  for (const check of report.unitChecks) {
    const condition = typeof check?.condition === 'string' ? check.condition.trim() : '';
    if (typeof check?.unitId !== 'string' || checks.has(check.unitId) || check.inspected !== true || condition.length < 3 || condition.length > 500) {
      throw new BadRequestException('Mỗi kho cần được xác nhận kiểm tra và có ghi nhận hiện trạng từ 3 đến 500 ký tự.');
    }
    checks.set(check.unitId, condition);
  }
  return units.map(unit => {
    const condition = checks.get(unit.id);
    if (!condition) throw new BadRequestException('Kết quả kiểm tra phải khớp với các kho vật lý trong lịch.');
    return { unitId: unit.id, unitCode: unit.unitNumber, condition, inspected: true };
  });
}

function handoverEvidence(report: Record<string, unknown>) {
  function entries(value: unknown, label: string): unknown[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 3) throw new BadRequestException('Chỉ được gửi tối đa 3 ' + label + '.');
    return value;
  }
  const photos = evidencePhotos(report.photos);
  const photoLinks = entries(report.photoLinks, 'link ảnh').map(value => {
    const link = typeof value === 'string' && value.length <= 2000 && !/\s/.test(value) ? URL.parse(value) : null;
    if (link?.protocol !== 'https:' || link.username || link.password) throw new BadRequestException('Link ảnh phải là đường dẫn HTTPS hợp lệ.');
    return link.href;
  });
  return { ...(photos.length ? { photos } : {}), ...(photoLinks.length ? { photoLinks } : {}) };
}

export function handoverReport(input: Record<string, unknown>, customer?: { id: string; fullName: string }, units: readonly PhysicalUnit[] = []) {
  return parseHandoverReport(input, customer, units).text;
}

export function parseHandoverReport(input: Record<string, unknown>, customer?: { id: string; fullName: string }, units: readonly PhysicalUnit[] = []) {
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (input.handoverReport === undefined) throw new BadRequestException('Cần gửi biên bản bàn giao đầy đủ.');
  const report = input.handoverReport && typeof input.handoverReport === 'object' && !Array.isArray(input.handoverReport) ? input.handoverReport as Record<string, unknown> : {};
  const recipientType = report.recipientType ?? 'CUSTOMER';
  if (typeof recipientType !== 'string' || !['CUSTOMER', 'AUTHORIZED'].includes(recipientType)) throw new BadRequestException('Loại người nhận không hợp lệ.');
  const authorizationBasis = typeof report.authorizationBasis === 'string' ? report.authorizationBasis.trim() : '';
  if (recipientType === 'AUTHORIZED' && (authorizationBasis.length < 3 || authorizationBasis.length > 500)) throw new BadRequestException('Cần ghi căn cứ ủy quyền, tối đa 500 ký tự.');
  const suppliedName = typeof report.recipientName === 'string' ? report.recipientName.trim() : '';
  if (recipientType === 'CUSTOMER' && customer && suppliedName && suppliedName !== customer.fullName.trim()) throw new BadRequestException('Người nhận phải là khách đứng tên hợp đồng hoặc chọn người được ủy quyền.');
  const recipientName = recipientType === 'CUSTOMER' && customer ? customer.fullName.trim() : typeof report.recipientName === 'string' ? report.recipientName.trim() : '';
  const condition = typeof report.condition === 'string' ? report.condition.trim() : '';
  if (recipientName.length < 2 || recipientName.length > 120 || condition.length < 3 || condition.length > 500 || note.length > 1000) throw new BadRequestException('Nhập tên người nhận, hiện trạng kho và ghi chú trong giới hạn cho phép.');
  if (report.identityVerified !== true || report.unitInspected !== true || report.accessDelivered !== true) throw new BadRequestException('Cần đối chiếu người nhận, kiểm tra từng kho và bàn giao phương tiện truy cập thực tế.');
  if (report.documentsDelivered !== undefined && report.documentsDelivered !== true) throw new BadRequestException('Cần xác nhận đã giao giấy tờ bàn giao cho khách.');
  const count = report.accessItemCount;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count > 50) throw new BadRequestException('Số chìa khóa/thẻ bàn giao phải là số nguyên từ 0 đến 50.');
  const unitChecks = checkedUnits(report, units);
  const evidence = handoverEvidence(report);
  const text = [
    'BIÊN BẢN BÀN GIAO KHO',
    `Người nhận: ${recipientName}`,
    ...(customer ? [`Khách đứng tên: ${customer.fullName} (${customer.id})`] : []),
    `Hình thức nhận: ${recipientType === 'AUTHORIZED' ? 'Người được ủy quyền' : 'Khách đứng tên hợp đồng'}`,
    ...(recipientType === 'AUTHORIZED' ? [`Căn cứ ủy quyền: ${authorizationBasis}`] : []),
    'Đã đối chiếu người nhận và kiểm tra các kho trong lịch.',
    `Hiện trạng: ${condition}`,
    ...(unitChecks?.map(unit => `Kho ${unit.unitCode}: ${unit.condition}`) ?? []),
    `Số chìa khóa/thẻ: ${count}`,
    'Đã bàn giao phương tiện/hướng dẫn truy cập.',
    ...(report.documentsDelivered === true ? ['Đã giao giấy tờ bàn giao cho khách.'] : []),
    ...(note ? [`Ghi chú: ${note}`] : []),
  ].join('\n');
  return { text, data: {
    recipientType, recipientName, customerName: customer?.fullName ?? '',
    authorizationBasis: recipientType === 'AUTHORIZED' ? authorizationBasis : null,
    condition, accessItemCount: count, identityVerified: true, unitInspected: true, accessDelivered: true,
    documentsDelivered: report.documentsDelivered === true, note, ...evidence, ...(unitChecks ? { unitChecks } : {}),
  } };
}
