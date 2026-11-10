export function profileContactIssue(fullName: string, phone: string) {
  const name = fullName.trim(), number = phone.trim();
  if (name.length < 2 || name.length > 120) return 'Họ và tên cần từ 2 đến 120 ký tự.';
  if (!/^\+?[\d\s().-]{8,25}$/.test(number) || number.replace(/\D/g, '').length < 8 || number.replace(/\D/g, '').length > 15) return 'Nhập số điện thoại hợp lệ có từ 8 đến 15 chữ số để NestBox liên hệ bàn giao.';
  return '';
}
