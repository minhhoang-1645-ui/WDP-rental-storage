import type { BankTransferConfig } from '../types/payment'

function tlv(tag: string, value: string) {
  const length = new TextEncoder().encode(value).length
  if (length > 99) throw new Error('Thông tin QR quá dài.')
  return tag + String(length).padStart(2, '0') + value
}

function crc16(payload: string) {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function buildVietQrPayload(config: BankTransferConfig, amount: number, invoiceCode: string) {
  if (!config.configured || !/^\d{6}$/.test(config.bankCode) || !config.accountNumber || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Thiếu cấu hình ngân hàng hoặc số tiền chuyển khoản không hợp lệ.')
  }
  const merchantAccount = tlv('00', 'A000000727') + tlv('01', config.bankCode) + tlv('02', config.accountNumber) + tlv('03', 'QRIBFTTA')
  const additionalData = tlv('08', invoiceCode)
  const merchantName = config.accountName.normalize('NFD').replace(/Đ/g, 'D').replace(/đ/g, 'd').replace(/[\u0300-\u036f]/g, '').toUpperCase().slice(0, 25)
  const payload = '000201' + '010212' + tlv('38', merchantAccount) + tlv('52', '0000') + tlv('53', '704') + tlv('54', String(amount)) + tlv('58', 'VN') + tlv('59', merchantName) + tlv('60', 'VIETNAM') + tlv('62', additionalData) + '6304'
  return payload + crc16(payload)
}
