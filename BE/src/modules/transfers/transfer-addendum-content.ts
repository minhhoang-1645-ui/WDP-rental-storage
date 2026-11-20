type Section = { title: string; rows?: [string, string][]; paragraphs?: string[] };

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
const date = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', ...(value.includes('T') ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(value)) : 'Chưa ghi nhận';

export function transferAddendumContent(snapshot: any, transferCode: string) {
  const { issuer, customer, from, to, financialReview: review } = snapshot;
  const sections: Section[] = [
    { title: 'Bên cho thuê', rows: [['Tên pháp nhân', issuer.legalName || 'Chưa cấu hình pháp nhân'], ['Mã số thuế', issuer.taxCode || 'Chưa cấu hình'], ['Địa chỉ', issuer.address || 'Chưa cấu hình'], ['Người đại diện', issuer.representative || 'Chưa cấu hình']] },
    { title: 'Khách thuê', rows: [['Họ và tên', customer?.fullName ?? 'Chưa cấu hình'], ['Email', customer?.email ?? 'Chưa cấu hình'], ['Điện thoại', customer?.phone || 'Chưa cung cấp']] },
    { title: 'Thông tin điều chỉnh', rows: [['Hợp đồng gốc', snapshot.contractCode], ['Lệnh chuyển', transferCode], ['Kho đang dùng', `${from.code} - ${from.typeName}`], ['Kho chuyển đến', `${to.code} - ${to.typeName}`], ['Giá hiện tại/tháng', money(snapshot.currentRate)], ['Giá mới/tháng', money(snapshot.newRate)], ['Áp dụng giá mới từ', date(snapshot.effectiveFrom)]] },
  ];
  if (review) sections.push({ title: 'Đối chiếu tại thời điểm lập phụ lục', rows: [
    ['Thời hạn giữ nguyên', `${date(review.leaseStart)} đến trước ${date(review.leaseEnd)}`], ['Lịch khách đề xuất', date(review.requestedMoveDate)],
    ['Đã thanh toán theo hóa đơn', money(review.paidAmount)], ['Còn phải trả', money(review.outstandingAmount)],
    ['Công nợ đến hạn cần thanh toán trước bàn giao', money(review.dueAmount)], ['Cọc giữ nguyên', money(review.depositAmount)],
    ['Tăng tiền thuê kỳ sau', money(review.futureRentIncrease)], ['Giảm tiền thuê kỳ sau', money(review.futureRentReduction)], ['Phí chuyển kho thu ngay', money(0)],
  ], paragraphs: [
    ...review.renewals.map((renewal: { appendixCode: string; start: string; end: string }) => `Giữ nguyên phụ lục gia hạn ${renewal.appendixCode} (${date(renewal.start)} đến trước ${date(renewal.end)}).`),
    'Số dư được kiểm tra lại khi bàn giao. Giảm giá của kỳ chưa thu làm giảm hóa đơn kỳ đó. Các khoản đã thanh toán và tiền cọc được giữ nguyên.',
  ] });
  sections.push({ title: 'Điều khoản áp dụng', paragraphs: [
    'Kỳ thu hiện tại giữ nguyên. Giá mới áp dụng từ kỳ thu tiếp theo nêu trên; tiền cọc giữ nguyên để quyết toán theo hợp đồng. Hóa đơn kỳ tương lai chưa thu được thay bằng hóa đơn mới có liên kết, không xóa hóa đơn hoặc chứng cứ cũ.',
    snapshot.smaller ? 'Kho đích có diện tích nhỏ hơn. Khách tự kiểm tra khả năng xếp hàng; không có bảo đảm mọi hàng hóa đều vừa kho mới.' : 'Khách kiểm tra kích thước và nhu cầu lưu trữ trước khi chấp thuận.',
    'Chuyển thực tế chỉ được hoàn tất sau khi khách ký phụ lục và nhân viên đối chiếu hàng hóa. Chữ ký hợp đồng ban đầu được giữ nguyên.',
  ] });
  return { code: snapshot.code as string, version: snapshot.version as string, issuerDraft: issuer.draft !== false, sections };
}
