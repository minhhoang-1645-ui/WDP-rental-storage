import { BadRequestException } from '@nestjs/common';

/** Structured staff attestation stored as a readable report in the existing handoverNote field. */
export function handoverReport(input: Record<string, unknown>) {
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (input.handoverReport === undefined) return undefined; // Compatibility for existing callers; date/payment/signature gates remain mandatory.
  const report = input.handoverReport && typeof input.handoverReport === 'object' && !Array.isArray(input.handoverReport) ? input.handoverReport as Record<string, unknown> : {};
  const recipientName = typeof report.recipientName === 'string' ? report.recipientName.trim() : '';
  const condition = typeof report.condition === 'string' ? report.condition.trim() : '';
  if (recipientName.length < 2 || recipientName.length > 120 || condition.length < 3 || condition.length > 500 || note.length > 1000) throw new BadRequestException('Nhập tên người nhận, hiện trạng kho và ghi chú trong giới hạn cho phép.');
  if (report.identityVerified !== true || report.unitInspected !== true || report.accessDelivered !== true) throw new BadRequestException('Cần đối chiếu người nhận, kiểm tra từng kho và bàn giao phương tiện truy cập thực tế.');
  const count = Number(report.accessItemCount);
  if (!Number.isSafeInteger(count) || count < 0 || count > 50) throw new BadRequestException('Số chìa khóa/thẻ bàn giao phải là số nguyên từ 0 đến 50.');
  return ['BIÊN BẢN BÀN GIAO KHO', `Người nhận: ${recipientName}`, 'Đã đối chiếu người nhận và kiểm tra các kho trong lịch.', `Hiện trạng: ${condition}`, `Số chìa khóa/thẻ: ${count}`, 'Đã bàn giao phương tiện/hướng dẫn truy cập.', ...(note ? [`Ghi chú: ${note}`] : [])].join('\n');
}
