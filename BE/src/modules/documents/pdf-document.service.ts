import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { DocumentPolicy } from './document-policy.js';
import { signaturePngBytes } from '../contracts/signature.js';

const money = (value: unknown) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? `${new Intl.NumberFormat('vi-VN').format(Number(value))} đ` : 'Chưa xác định';
const date = (value: unknown) => { const text = typeof value === 'string' ? value : value instanceof Date ? value.toISOString() : ''; const parsed = new Date(text); return text && !Number.isNaN(parsed.getTime()) ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', ...(text.includes('T') ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(parsed) : 'Chưa ghi nhận'; };
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : 'Chưa cấu hình';

@Injectable()
export class PdfDocumentService {
  constructor(private readonly policy: DocumentPolicy) {}

  async contract(contract: any) {
    const document = contract.terms.document, issuer = document.issuer ?? { brand: 'NestBox Storage', draft: true };
    return this.render('HỢP ĐỒNG THUÊ KHO', contract.contractCode, issuer, pdf => {
      if (document.legacySnapshotUnavailable) this.paragraph(pdf, 'BẢN ĐỐI CHIẾU HỒ SƠ CŨ: phiên bản trước chưa lưu bản nội dung gốc được ký. File này tổng hợp dữ liệu hiện có, không xác nhận lại điều khoản hoặc tính toàn vẹn của nội dung ký trước đây.');
      this.party(pdf, issuer, document.customer ?? contract.reservation.customer);
      this.section(pdf, 'Thông tin kho và thời hạn');
      this.rows(pdf, [['Mã đặt kho', document.reservationReference], ['Kho thuê', `${document.storage?.name ?? contract.storageType.name} - ${document.storage?.unitCode ?? contract.storageUnit.unitCode}`], ['Bắt đầu thuê', date(document.startDate)], ['Kết thúc kỳ thuê', `${date(document.endDate)} (không bao gồm ngày này)`], ['Phiên bản nội dung', document.version]]);
      this.quote(pdf, document.pricing, document.quantity);
      if (Array.isArray(document.clauses)) for (const clause of document.clauses) { pdf.font('Regular').fontSize(10); this.ensure(pdf, pdf.heightOfString(text(clause.text), { width: 499, lineGap: 4 }) + 45); this.section(pdf, text(clause.title)); this.paragraph(pdf, text(clause.text)); }
      else this.paragraph(pdf, 'Hồ sơ phiên bản trước: tài liệu này thể hiện đúng các thông tin đã lưu. Không bổ sung điều khoản hoặc xác thực OTP hồi tố vào nội dung khách đã xác nhận.');
      this.signature(pdf, contract.terms);
      this.paragraph(pdf, `Mã kiểm tra nội dung SHA-256: ${contract.terms.snapshotHash}`, 8);
    });
  }

  async appendix(record: any, customer: any) {
    const appendix = record.appendix, document = appendix.snapshot;
    const issuer = document.issuer ?? { brand: 'NestBox Storage', draft: true };
    return this.render('PHỤ LỤC GIA HẠN THUÊ KHO', appendix.code, issuer, pdf => {
      this.party(pdf, issuer, document.customer ?? customer);
      this.rows(pdf, [['Mã yêu cầu gia hạn', record.renewalCode], ['Mã đặt kho', document.reservationReference], ['Kết thúc kỳ trước', date(document.previousEndDate)], ['Kết thúc kỳ gia hạn', `${date(document.requestedEndDate)} (không bao gồm ngày này)`], ['Thời gian thêm', `${document.termMonths} tháng`]]);
      this.section(pdf, 'Hợp đồng và kho liên quan');
      for (const contract of document.contracts ?? []) this.paragraph(pdf, `${contract.contractCode} - Kho ${contract.unitCode ?? contract.storageUnit?.unitCode ?? 'Chưa ghi nhận mã kho trong hồ sơ cũ'}`);
      this.quote(pdf, document.quote, record.reservation.quantity);
      const activation = record.invoices?.find((invoice: any) => invoice.renewalCycle === 1);
      if (activation) this.rows(pdf, [['Hóa đơn kích hoạt gia hạn', activation.invoiceCode], ['Giá trị hóa đơn kích hoạt', money(activation.totalAmount)]]);
      this.section(pdf, 'Hiệu lực phụ lục');
      this.paragraph(pdf, 'Phụ lục chỉ kéo dài thời hạn sau khi được chấp thuận, khách ký xác nhận và khoản thanh toán kích hoạt được xác nhận. Không thu lại tiền cọc ban đầu. Các điều khoản không thay đổi tiếp tục theo hợp đồng gốc. Không tự mặc định đã thanh toán chỉ vì khách gửi thông báo chuyển khoản.');
      this.signature(pdf, appendix);
      this.paragraph(pdf, `Mã kiểm tra nội dung SHA-256: ${appendix.snapshotHash}`, 8);
    });
  }

  async invoice(invoice: any, customer: any, contracts: any[], renewal?: any) {
    return this.render('HÓA ĐƠN THUÊ KHO / CHỨNG TỪ NỘI BỘ', invoice.invoiceCode, this.policy.issuer(), pdf => {
      const issuer = this.policy.issuer();
      this.section(pdf, 'Đơn vị phát hành'); this.paragraph(pdf, `${issuer.legalName || issuer.brand} | MST: ${issuer.taxCode || 'Chưa cấu hình'}\n${issuer.address || 'Chưa cấu hình địa chỉ pháp nhân'}`);
      this.section(pdf, 'Khách thuê'); this.paragraph(pdf, `${customer?.fullName || 'Khách thuê'} | ${customer?.email || ''} | ${customer?.phone || 'Chưa cung cấp điện thoại'}`);
      this.rows(pdf, [['Mã đặt kho', invoice.reservation.reference], ['Ngày phát hành', date(invoice.issuedAt)], ['Kỳ tính phí', `${date(invoice.billingPeriodStart)} đến ${date(invoice.billingPeriodEnd)} (không gồm ngày cuối)`], ['Tình trạng', ({ OPEN: 'Chưa thanh toán', PARTIALLY_PAID: 'Đã thanh toán một phần', PAID: 'Đã thanh toán đủ', VOID: 'Đã hủy' } as any)[invoice.status] ?? invoice.status]]);
      this.section(pdf, 'Chi tiết khoản thu của hóa đơn này');
      this.ensure(pdf, 230);
      this.rows(pdf, [['Tiền thuê kho (sau chiết khấu nếu có)', money(invoice.rentalAmount)], ['Tiền cọc', money(invoice.depositAmount)], ['Dịch vụ theo kỳ hóa đơn', money(invoice.serviceAmount)], ['Phí phát sinh được duyệt', money(invoice.chargeAmount)], ['Tổng hóa đơn', money(invoice.totalAmount)], ['Đã ghi nhận thanh toán', money(invoice.amountPaid)], ['CÒN PHẢI THANH TOÁN', money(invoice.balanceDue)]]);
      this.paragraph(pdf, 'Chỉ các khoản đã được xác nhận mới được tính vào số đã thanh toán. Thông báo chuyển khoản chờ kiểm tra chưa phải chứng từ thu tiền. Chi tiết báo giá toàn kỳ không phải khoản thu lặp lại của hóa đơn này.');
      if (invoice.payments?.length) { this.section(pdf, 'Lịch sử thu tiền đã xác nhận'); for (const payment of invoice.payments) this.paragraph(pdf, `${date(payment.receivedAt)} - ${money(payment.amount)} - ${payment.method === 'CASH' ? 'Tiền mặt' : payment.method === 'VNPAY' ? 'VNPay' : 'Chuyển khoản'} - ${payment.paymentCode}`); }
      this.section(pdf, 'Chữ ký từ hợp đồng liên quan');
      this.paragraph(pdf, 'Các chữ ký dưới đây được sao chiếu từ hợp đồng khách đã ký, không phải chữ ký xác nhận mới cho hóa đơn và không phải chữ ký số chứng thực.');
      for (const contract of contracts) { this.paragraph(pdf, `${contract.contractCode} - ${contract.storageUnit.unitCode}`); this.signature(pdf, contract.terms); }
      if (renewal?.appendix) { this.section(pdf, `Phụ lục liên quan: ${renewal.appendix.code}`); this.signature(pdf, renewal.appendix); }
      if (!contracts.length) this.paragraph(pdf, 'Chưa có hợp đồng liên quan đã được xác nhận.');
      this.paragraph(pdf, 'Đây là chứng từ nội bộ phục vụ đối chiếu, không thay thế hóa đơn điện tử thuế do hệ thống có thẩm quyền phát hành.', 9);
    });
  }

  private render(title: string, code: string, issuer: any, content: (pdf: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pdf = new PDFDocument({ size: 'A4', margins: { top: 52, bottom: 52, left: 48, right: 48 }, bufferPages: true, autoFirstPage: true, info: { Title: `${title} ${code}`, Author: issuer.brand ?? 'NestBox Storage', Subject: issuer.draft ? 'Dự thảo - chưa cấu hình bên cho thuê' : 'Hồ sơ thuê kho' } });
      const chunks: Buffer[] = [];
      pdf.on('data', chunk => chunks.push(chunk)); pdf.on('end', () => resolve(Buffer.concat(chunks))); pdf.on('error', reject);
      try {
        pdf.registerFont('Regular', fileURLToPath(new URL('../../assets/fonts/NotoSans-Regular.ttf', import.meta.url)));
        pdf.registerFont('Bold', fileURLToPath(new URL('../../assets/fonts/NotoSans-Bold.ttf', import.meta.url)));
        pdf.font('Bold').fontSize(17).fillColor('#233e50').text('NestBox Storage');
        pdf.moveDown(.5).fontSize(15).text(title, { align: 'center' });
        pdf.font('Regular').fontSize(10).text(`Số: ${code}`, { align: 'center' });
        if (issuer.draft) { pdf.moveDown(.6).font('Bold').fillColor('#a64d22').text('DỰ THẢO - CHƯA PHÁT HÀNH CHÍNH THỨC', { align: 'center' }); this.paragraph(pdf, 'Thông tin pháp nhân hoặc điều khoản chưa được bên cho thuê xác nhận. Không sử dụng bản này để khẳng định hợp đồng đã được kiểm duyệt pháp lý.', 9); }
        pdf.moveDown(.8); content(pdf);
        const range = pdf.bufferedPageRange();
        for (let page = range.start; page < range.start + range.count; page++) {
          pdf.switchToPage(page);
          const bottom = pdf.page.margins.bottom; pdf.page.margins.bottom = 0;
          pdf.font('Regular').fontSize(8).fillColor('#637585').text(`${code} | ${issuer.draft ? 'Dự thảo | ' : ''}Trang ${page + 1}/${range.count}`, 48, pdf.page.height - 35, { width: pdf.page.width - 96, lineBreak: false, align: 'center' });
          pdf.page.margins.bottom = bottom;
        }
        pdf.end();
      } catch (error) { pdf.destroy(); reject(error); }
    });
  }

  private ensure(pdf: PDFKit.PDFDocument, height: number) { if (pdf.y + height > pdf.page.height - 62) pdf.addPage(); }
  private section(pdf: PDFKit.PDFDocument, title: string) { this.ensure(pdf, 65); pdf.moveDown(.6).font('Bold').fontSize(11).fillColor('#233e50').text(title); pdf.moveDown(.3); }
  private paragraph(pdf: PDFKit.PDFDocument, value: string, size = 10) { pdf.font('Regular').fontSize(size); const height = pdf.heightOfString(value, { width: 499, lineGap: 4 }) + 8; if (height < 650) this.ensure(pdf, height); pdf.fillColor('#263849').text(value, { lineGap: 4, paragraphGap: 8 }); }
  private rows(pdf: PDFKit.PDFDocument, values: unknown[][]) {
    for (const [label, value] of values) {
      pdf.font('Regular').fontSize(10);
      const height = Math.max(pdf.heightOfString(text(label), { width: 188 }), pdf.heightOfString(text(value), { width: 290 })) + 16;
      this.ensure(pdf, height);
      const y = pdf.y;
      pdf.fillColor('#617080').text(text(label), 48, y, { width: 188 });
      pdf.fillColor('#233e50').text(text(value), 246, y, { width: 301 });
      pdf.moveTo(48, y + height - 6).lineTo(547, y + height - 6).lineWidth(.3).strokeColor('#dbe3e8').stroke();
      pdf.x = 48; pdf.y = y + height;
    }
  }
  private party(pdf: PDFKit.PDFDocument, issuer: any, customer: any) {
    this.section(pdf, 'Bên cho thuê'); this.rows(pdf, [['Tên pháp nhân', issuer.legalName || 'Chưa cấu hình pháp nhân'], ['Mã số thuế', issuer.taxCode || 'Chưa cấu hình'], ['Địa chỉ', issuer.address || 'Chưa cấu hình'], ['Người đại diện', issuer.representative || 'Chưa cấu hình']]);
    this.section(pdf, 'Khách thuê'); this.rows(pdf, [['Họ và tên', customer?.fullName], ['Email', customer?.email], ['Điện thoại', customer?.phone || 'Chưa cung cấp']]);
  }
  private quote(pdf: PDFKit.PDFDocument, quote: any, quantity: unknown) {
    if (!quote) return;
    this.section(pdf, 'Báo giá đính kèm của yêu cầu đặt kho');
    this.paragraph(pdf, `Báo giá cho toàn bộ ${Number(quantity) || 1} kho của yêu cầu, không nhân lại tổng này cho từng hợp đồng kho.`);
    const total = quote.quotedTotalAmount ?? quote.totalAmount ?? quote.grandTotal;
    for (const line of quote.lineItems ?? []) this.rows(pdf, [[`${line.label ?? line.name ?? 'Khoản phí theo báo giá'}${line.basis ? `\n${line.basis}` : ''}`, money(line.amount ?? line.totalAmount)]]);
    if (!quote.lineItems && quote.baseRentalAmount !== undefined) this.rows(pdf, [['Tiền thuê trước chiết khấu', money(quote.baseRentalAmount)], ['Chiết khấu trả trước', money(quote.discountAmount)], ['Tiền thuê sau chiết khấu', money(quote.rentalAmount)], ['Tiền cọc mới', money(quote.depositAmount)]]);
    if (total !== undefined) this.rows(pdf, [['Tổng cả kỳ, gồm cọc nếu có', money(total)]]);
    const initial = quote.initialPaymentBreakdown?.totalAmount ?? quote.estimatedInitialAmountDue ?? quote.initialInvoiceEstimate?.totalAmount ?? quote.initialInvoiceEstimate?.amountDue;
    if (initial !== undefined) this.rows(pdf, [['Dự kiến thanh toán lần đầu', money(initial)]]);
    this.paragraph(pdf, 'Số cần thanh toán thực tế theo từng hóa đơn và số dư còn lại tại thời điểm trả tiền. Dịch vụ tính theo lần/ngày/tháng theo đơn vị đã ghi trong báo giá.');
  }
  private signature(pdf: PDFKit.PDFDocument, terms: any) {
    this.section(pdf, 'Xác nhận của khách thuê');
    if (!terms.acceptedAt) { this.paragraph(pdf, 'Chưa ký xác nhận. Khách cần xem nội dung, vẽ chữ ký và nhập mã xác thực email.'); return; }
    this.ensure(pdf, 150);
    if (terms.signatureImage) { const bytes = signaturePngBytes(terms.signatureImage); if (bytes) { pdf.image(bytes, 48, pdf.y, { fit: [240, 85] }); pdf.y += 90; } else this.paragraph(pdf, 'Ảnh chữ ký trong hồ sơ cũ không đọc được. Vui lòng đối chiếu hồ sơ gốc.'); }
    this.paragraph(pdf, `${terms.acceptanceName || 'Khách thuê'} - ${date(terms.acceptedAt)}`);
    this.paragraph(pdf, terms.verification?.method === 'EMAIL_OTP' ? `Xác thực email OTP: ${terms.verification.recipient}, ${date(terms.verification.verifiedAt)}.` : 'Hồ sơ phiên bản trước; không có bằng chứng xác thực OTP.', 9);
  }
}
