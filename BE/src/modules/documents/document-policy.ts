import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DocumentPolicy {
  constructor(private readonly config: ConfigService) {}
  issuer() {
    const read = (key: string) => this.config.get<string>(key)?.trim() ?? '';
    const legalName = read('CONTRACT_LEGAL_NAME'), taxCode = read('CONTRACT_TAX_CODE'), address = read('CONTRACT_ADDRESS'), representative = read('CONTRACT_REPRESENTATIVE');
    return { brand: 'NestBox Storage', legalName, taxCode, address, representative, termsVersion: read('CONTRACT_TERMS_VERSION') || 'NESTBOX-RENTAL-V2', draft: !(legalName && taxCode && address && representative && read('CONTRACT_TERMS_APPROVED') === 'true') };
  }
  terms() {
    return [
      { title: '1. Đối tượng và thời hạn thuê', text: 'Bên cho thuê cung cấp quyền sử dụng kho nêu trong hợp đồng để lưu giữ hàng hóa hợp pháp. Ngày kết thúc là mốc kết thúc kỳ thuê, không bao gồm ngày này. Bàn giao thực tế được lập thành biên bản sau khi hoàn tất chữ ký và nghĩa vụ thanh toán đến hạn.' },
      { title: '2. Giá thuê và thanh toán', text: 'Giá, chiết khấu, dịch vụ và tiền cọc được xác định theo báo giá đính kèm đã chốt cho yêu cầu đặt kho. Thanh toán theo kỳ hoặc trả trước theo phương án đã chọn. Tiền cọc thu một lần; không phải tiền thuê và không tự động cấn trừ vào kỳ cuối. Chuyển khoản chỉ được ghi nhận sau khi cơ sở xác minh hoặc nhận kết quả hợp lệ từ kênh thanh toán.' },
      { title: '3. Bàn giao, ra vào và hàng hóa', text: 'Hai bên đối chiếu mã kho, hiện trạng và lịch bàn giao. Khách chịu trách nhiệm về quyền sở hữu, khai báo và đóng gói hàng; không gửi hàng cấm, dễ cháy nổ, nguy hiểm hoặc trái quy định. Mỗi lần nhập/xuất hàng phải có phiếu và xác nhận số lượng thực tế. Quyền ra vào thực hiện theo quy định của cơ sở.' },
      { title: '4. Sự cố và bảo trì', text: 'Khách thông báo sự cố qua hệ thống. Cơ sở tiếp nhận, đánh giá và tổ chức xử lý; việc di chuyển hàng hoặc thay đổi kho phải có yêu cầu và xác nhận phù hợp. Không tự chuyển hàng sang kho khác khi chưa có chấp thuận.' },
      { title: '5. Gia hạn và chuyển kho', text: 'Gia hạn chỉ có hiệu lực sau khi yêu cầu được duyệt, phụ lục được ký và khoản thanh toán kích hoạt được xác nhận. Chuyển kho được ghi nhận theo hồ sơ điều chuyển và biên bản thực tế; mã kho mới được cập nhật sau khi hoàn tất.' },
      { title: '6. Trả kho và quyết toán', text: 'Khách gửi yêu cầu trả kho, phối hợp kiểm tra và lấy hết hàng. Trả trước hạn phải được quản lý xem xét công nợ, chi phí và chấp thuận trước khi thực hiện; không mặc nhiên được hoàn tiền thuê còn lại. Khoản khấu trừ, công nợ và tiền cọc hoàn lại được thông báo trong hồ sơ quyết toán để đối chiếu.' },
      { title: '7. Xác nhận điện tử', text: 'Khách xem đúng phiên bản tài liệu, vẽ chữ ký và xác thực bằng mã gửi đến email tài khoản. Hệ thống lưu ảnh chữ ký, thời điểm và dấu vết xác thực gắn với nội dung. Đây là xác nhận điện tử trong hệ thống, không tự đồng nghĩa với chữ ký số được chứng thực. Hồ sơ đã ký được giữ nguyên nội dung.' },
      { title: '8. Đối chiếu và giải quyết vướng mắc', text: 'Hai bên thông báo và đối chiếu chứng từ khi có sai khác. Điều khoản cụ thể cần được bên cho thuê kiểm tra, công bố và chấp thuận trước khi sử dụng chính thức. Bản có nhãn DỰ THẢO chưa phải tài liệu phát hành chính thức.' },
    ];
  }
}
