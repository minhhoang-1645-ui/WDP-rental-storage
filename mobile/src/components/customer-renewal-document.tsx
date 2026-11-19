import { Text } from 'react-native';
import { useResource } from '@/operations/use-resource';
import { object, rows, text, type Row } from '@/operations/model';
import { formatDate, formatMoney, statusLabel } from '@/utils/format';
import { DocumentPaper, DocumentSection, DocumentSignature, documentStyles } from './customer-document-paper';
import { JourneyNotice, JourneyScreen } from './customer-journey-ui';
import { ErrorState, LoadingState } from './screen-state';

const money = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? formatMoney(value) : '';

export function CustomerRenewalDocument({ id }: { id: string }) {
  const source = useResource<Row>('/customer/renewals/' + encodeURIComponent(id));
  const renewal = source.data ?? {};
  const appendix = object(renewal.appendix);
  const document = object(appendix.snapshot);
  const quote = object(document.quote);
  const issuer = object(document.issuer);
  const code = text(appendix, 'code');
  const oldEnd = text(document, 'previousEndDate');
  const newEnd = text(document, 'requestedEndDate');
  const months = text(document, 'termMonths');
  const paymentPlan = text(document, 'paymentPlan') || text(quote, 'paymentPlan');
  const invoice = rows(renewal.invoices).find(item => Number(item.renewalCycle) === 1);
  const quoteLines = rows(quote.lineItems);
  const amounts: [string, string][] = quoteLines.length
    ? quoteLines.map(line => [
      text(line, 'label', 'name') || 'Khoản phí',
      [money(line.amount ?? line.totalAmount), text(line, 'basis')].filter(Boolean).join(' · '),
    ]) : [
      ['Tiền thuê trước giảm giá', money(quote.baseRentalAmount)],
      ['Giảm giá', money(quote.discountAmount)],
      ['Tiền thuê sau giảm giá', money(quote.rentalAmount)],
      ['Tiền cọc mới', money(quote.depositAmount)],
    ];

  return <JourneyScreen title="Xem phụ lục gia hạn">
    {source.error ? <ErrorState message={source.error} onRetry={source.refresh} />
      : source.loading ? <LoadingState layout="detail" />
      : !code || !Object.keys(document).length
        ? <ErrorState message="Chưa có nội dung phụ lục để hiển thị." onRetry={source.refresh} />
        : <DocumentPaper title="Phụ lục gia hạn thuê kho" meta={[code, text(document, 'version') || text(appendix, 'version')].filter(Boolean).join(' · ')}>
          {issuer.draft === true && <JourneyNotice title="Bản dự thảo" message="Thông tin pháp nhân chưa được phê duyệt đầy đủ." />}
          <DocumentSection title="Bên cho thuê" values={[
            ['Tên pháp nhân', text(issuer, 'legalName')], ['Mã số thuế', text(issuer, 'taxCode')],
            ['Địa chỉ', text(issuer, 'address')], ['Người đại diện', text(issuer, 'representative')],
          ]} />
          <DocumentSection title="Khách thuê" values={[
            ['Họ và tên', text(document, 'customer.fullName')], ['Email', text(document, 'customer.email')],
            ['Điện thoại', text(document, 'customer.phone')],
          ]} />
          <DocumentSection title="Hợp đồng và thời hạn gia hạn" values={[
            ['Mã yêu cầu', text(document, 'renewalCode') || text(renewal, 'renewalCode')],
            ['Đơn đặt kho', text(document, 'reservationReference')],
            ...rows(document.contracts).map((contract): [string, string] => [
              'Hợp đồng liên quan',
              [text(contract, 'contractCode'), text(contract, 'unitCode', 'storageUnit.unitCode')].filter(Boolean).join(' · '),
            ]),
            ['Kết thúc kỳ trước', oldEnd ? formatDate(oldEnd) : ''],
            ['Kết thúc kỳ gia hạn', newEnd ? formatDate(newEnd) + ' (không bao gồm ngày này)' : ''],
            ['Thời gian thêm', months ? months + ' tháng' : ''],
          ]} />
          <DocumentSection title="Báo giá gia hạn" values={[
            ['Cách thanh toán', paymentPlan ? statusLabel(paymentPlan) : ''], ...amounts,
            ['Tổng tiền gia hạn', money(quote.quotedTotalAmount ?? quote.totalAmount ?? quote.grandTotal)],
            ['Hóa đơn kích hoạt', text(invoice ?? {}, 'invoiceCode')],
            ['Giá trị hóa đơn kích hoạt', money(invoice?.totalAmount)],
          ]} />
          <Text accessibilityRole="header" style={documentStyles.heading}>Hiệu lực phụ lục</Text>
          <Text selectable style={documentStyles.body}>Phụ lục có hiệu lực khi được chấp thuận, khách ký xác nhận và khoản thanh toán kích hoạt được xác nhận. Không thu lại tiền cọc ban đầu. Các điều khoản không thay đổi tiếp tục theo hợp đồng gốc.</Text>
          <DocumentSignature terms={appendix} />
        </DocumentPaper>}
  </JourneyScreen>;
}
