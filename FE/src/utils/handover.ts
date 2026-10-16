const zoneOffset = 7 * 60 * 60 * 1000
export function vietnamLocalMinute(time = Date.now()) { return new Date(time + zoneOffset).toISOString().slice(0, 16) }
export function handoverWindow(contracts: Array<{ startDate: string; endDate: string }>) {
  const starts = contracts.map(item => item.startDate?.slice(0, 10)).filter(Boolean).sort()
  const ends = contracts.map(item => item.endDate?.slice(0, 10)).filter(Boolean).sort()
  return { start: starts.at(-1) ?? '', end: ends[0] ?? '' }
}
export function handoverCompletionIssue(scheduledAt: unknown, now = Date.now()) {
  const planned = typeof scheduledAt === 'string' ? Date.parse(scheduledAt) : NaN
  if (!Number.isFinite(planned)) return 'Chưa có thời điểm bàn giao hợp lệ. Vui lòng kiểm tra lại lịch.'
  return planned > now ? 'Chưa đến thời điểm hẹn. Chỉ ghi nhận khi đã bàn giao thực tế, không hoàn tất trước lịch.' : ''
}
