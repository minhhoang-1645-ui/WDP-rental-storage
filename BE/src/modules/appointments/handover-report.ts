import { BadRequestException } from '@nestjs/common';

/** Structured staff attestation stored as a readable report in the existing handoverNote field. */
export function handoverReport(input: Record<string, unknown>, customer?: { id: string; fullName: string }) {
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
  return ['BIÊN BẢN BÀN GIAO KHO', `Người nhận: ${recipientName}`, ...(customer ? [`Khách đứng tên: ${customer.fullName} (${customer.id})`] : []), `Hình thức nhận: ${recipientType === 'AUTHORIZED' ? 'Người được ủy quyền' : 'Khách đứng tên hợp đồng'}`, ...(recipientType === 'AUTHORIZED' ? [`Căn cứ ủy quyền: ${authorizationBasis}`] : []), 'Đã đối chiếu người nhận và kiểm tra các kho trong lịch.', `Hiện trạng: ${condition}`, `Số chìa khóa/thẻ: ${count}`, 'Đã bàn giao phương tiện/hướng dẫn truy cập.', ...(report.documentsDelivered === true ? ['Đã giao giấy tờ bàn giao cho khách.'] : []), ...(note ? [`Ghi chú: ${note}`] : [])].join('\n');
}
