export const accountNameError = (value: string) => value.length < 2 || value.length > 120
  ? 'Họ và tên phải có 2–120 ký tự.' : '';

export function accountPhoneError(value: string) {
  const digits = value.replace(/\D/g, '').length;
  return !/^\+?[\d\s().-]{8,25}$/.test(value) || digits < 8 || digits > 15
    ? 'Số điện thoại phải có 8–15 chữ số.' : '';
}
