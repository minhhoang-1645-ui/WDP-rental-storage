export interface VietQrConfig { configured: boolean; bankCode: string; accountNumber: string }

function tlv(tag: string, value: string) {
  const length = new TextEncoder().encode(value).length;
  if (length > 99) throw new Error('Thông tin QR quá dài.');
  return tag + String(length).padStart(2, '0') + value;
}
function crc16(payload: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
/** Same VietQR payload contract as the web. Generated locally, no remote QR image service. */
export function buildVietQrPayload(config: VietQrConfig, amount: number, invoiceCode: string) {
  if (!config.configured || !/^\d{6}$/.test(config.bankCode) || !/^[A-Za-z0-9]{1,19}$/.test(config.accountNumber) || !Number.isSafeInteger(amount) || amount <= 0 || String(amount).length > 13 || !/^[\x20-\x7E]{1,50}$/.test(invoiceCode)) throw new Error('Thiếu cấu hình ngân hàng hoặc số tiền chuyển khoản không hợp lệ.');
  const beneficiary = tlv('00', config.bankCode) + tlv('01', config.accountNumber);
  const merchantAccount = tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');
  const payload = '000201' + '010212' + tlv('38', merchantAccount) + tlv('53', '704') + tlv('54', String(amount)) + tlv('58', 'VN') + tlv('62', tlv('08', invoiceCode)) + '6304';
  return payload + crc16(payload);
}
