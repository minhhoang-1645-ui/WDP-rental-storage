/** Only system error copy is translated; identifiers, paths and user content remain intact. */
export function userMessage(message: string) {
  const words: Record<string, string> = { customer: 'khách hàng', staff: 'nhân viên', manager: 'quản lý', admin: 'quản trị viên', reservation: 'yêu cầu đặt kho', unit: 'kho', reservationId: 'mã yêu cầu đặt kho', rentalContractId: 'mã hợp đồng', storedItemId: 'mã mặt hàng', scheduledAt: 'thời gian hẹn' };
  const branded = message.replace(/\bWDP Storage\b/g, 'NestBox Storage').replace(/\bWDP\b(?![-_])/g, 'NestBox');
  return branded.split(/(\s+)/).map(part => /[@/\\]/.test(part) ? part : part.replace(/\b(customer|staff|manager|admin|reservation|unit|reservationId|rentalContractId|storedItemId|scheduledAt)\b/gi, word => words[word] ?? words[word.toLowerCase()] ?? word)).join('');
}
