import { first, object, type Row } from '../components/manager/portal-data'

export function renewalReviewIssue(row: Row): string {
  const quote = object(row.quoteSnapshot), reservation = object(row.reservation)
  if (!first(row, 'previousEndDate') || !first(row, 'requestedEndDate') || String(row.requestedEndDate) <= String(row.previousEndDate)) return 'Thiếu hoặc sai kỳ gia hạn. Vui lòng tải lại hồ sơ trước khi duyệt.'
  if (quote.currency !== 'VND' || ![quote.monthlyUnitPrice, quote.baseRentalAmount, quote.discountPercent, quote.discountAmount, quote.rentalAmount, quote.totalAmount].every(Number.isSafeInteger) || Number(quote.totalAmount) <= 0 || Number(quote.monthlyUnitPrice) <= 0 || quote.depositAmount !== 0 || quote.totalAmount !== quote.rentalAmount || quote.termMonths !== row.termMonths || quote.paymentPlan !== row.paymentPlan || quote.quantity !== reservation.quantity || quote.previousEndDate !== row.previousEndDate || quote.requestedEndDate !== row.requestedEndDate || quote.storageTypeId !== object(reservation.storageType).id) return 'Báo giá gia hạn chưa đầy đủ hoặc không khớp kỳ thuê. Không thể duyệt khi chưa đối chiếu được số tiền.'
  if (row.status === 'PENDING' && reservation.currentEndDate && String(reservation.currentEndDate).slice(0, 10) !== String(row.previousEndDate).slice(0, 10)) return 'Hạn thuê hiện tại đã thay đổi so với yêu cầu. Tải lại và đối chiếu trước khi duyệt.'
  return ''
}
