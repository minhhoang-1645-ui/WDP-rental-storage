const zoneOffset = 7 * 60 * 60 * 1000
export function vietnamLocalMinute(time = Date.now()) { return new Date(time + zoneOffset).toISOString().slice(0, 16) }
export function keyCollectionStartDate(value: string, daysBefore = 3) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - daysBefore)
  return date.toISOString().slice(0, 10)
}
export function handoverWindow(contracts: { startDate: string; endDate: string }[]) {
  const starts = contracts.map(item => item.startDate?.slice(0, 10)).filter(Boolean).sort()
  const ends = contracts.map(item => item.endDate?.slice(0, 10)).filter(Boolean).sort()
  const start = starts.at(-1) ?? ''
  return { start, pickupStart: keyCollectionStartDate(start), end: ends[0] ?? '' }
}
export function handoverCompletionIssue(scheduledAt: unknown, now = Date.now(), contracts: { contractStartDate?: string; contractEndDate?: string }[] = []) {
  const planned = typeof scheduledAt === 'string' ? Date.parse(scheduledAt) : NaN
  if (!Number.isFinite(planned)) return 'Chưa có thời điểm bàn giao hợp lệ. Vui lòng kiểm tra lại lịch.'
  if (planned > now) {
    const appointmentTime = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(planned)
    return `Chưa đến giờ hẹn (${appointmentTime}, giờ Việt Nam). Bạn có thể xác nhận sau khi đã giao giấy tờ và chìa khóa cho khách.`
  }
  const today = vietnamLocalMinute(now).slice(0, 10)
  if (contracts.some(contract => contract.contractStartDate && today < keyCollectionStartDate(contract.contractStartDate))) return 'Chỉ được bàn giao chìa khóa sớm tối đa 3 ngày trước ngày thuê.'
  if (contracts.some(contract => contract.contractEndDate && today >= contract.contractEndDate)) return 'Không thể hoàn tất bàn giao sau ngày kết thúc thuê.'
  return ''
}
