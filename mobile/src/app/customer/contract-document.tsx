import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { useCustomerRentalJourney } from '@/hooks/use-customer-rental-journey';
import { useResource } from '@/operations/use-resource';
import { object, rows, text, type Row } from '@/operations/model';
import { JourneyScreen, JourneyNotice } from '@/components/customer-journey-ui';
import { LoadingState, ErrorState } from '@/components/screen-state';
import { canSignContract, contractAmount } from '@/components/customer-contracts';
import { formatDate, statusLabel } from '@/utils/format';
import { CustomerRenewalDocuments } from '@/components/contract-renewal-history';

import { DocumentPaper, DocumentSection as Section, DocumentSignature, documentStyles as s } from '@/components/customer-document-paper';
import { CustomerRenewalDocument } from '@/components/customer-renewal-document';

export default function ContractDocument() {
  const { id, renewalId } = useLocalSearchParams<{ id?: string; renewalId?: string }>();
  return typeof renewalId === 'string' && renewalId
    ? <CustomerRenewalDocument id={renewalId} />
    : <RentalContractDocument id={typeof id === 'string' ? id : ''} />;
}

function RentalContractDocument({ id }: { id: string }) {
  const source = useResource<Row>(id ? '/customer/contracts/' + encodeURIComponent(id) : null);
  const row = source.data;
  const flow = useCustomerRentalJourney(text(row ?? {}, 'reservation.id'));
  const terms = object(row?.terms);
  const document = object(terms.document);
  const issuer = object(document.issuer);
  const quote = object(document.pricing);
  const clauses = rows(document.clauses).filter(clause => text(clause, 'title') && text(clause, 'text'));
  const hash = text(terms, 'snapshotHash');
  const available = document.documentType === 'RENTAL_CONTRACT' && Boolean(hash && text(document, 'contractCode'));
  const action = available && clauses.length > 0 && row && canSignContract(row) && !source.loading && !source.error &&
    !flow.closed && !flow.loading && !flow.error ? {
      title: 'Tiếp tục ký', path: '/customer/contract-sign?id=' + encodeURIComponent(id) + '&reviewedHash=' + encodeURIComponent(hash),
    } : undefined;
  const lines = rows(quote.lineItems);
  const facility = object(document.facility);
  const bookingFacility = object(object(row?.reservation).facility);
  const initial = object(quote.initialPaymentBreakdown);
  const transfers = rows(row?.transfers).filter(transfer => transfer.status === 'COMPLETED');
  const currentUnit = object(row?.storageUnit);
  const currentLocation = [text(currentUnit, 'floor'), text(currentUnit, 'zone'),
    text(currentUnit, 'row') && 'Hàng ' + text(currentUnit, 'row'),
    text(currentUnit, 'position') && 'Vị trí ' + text(currentUnit, 'position')].filter(Boolean).join(' · ');
  const location = [text(document, 'storage.floor'), text(document, 'storage.zone'),
    text(document, 'storage.row') && 'Hàng ' + text(document, 'storage.row'),
    text(document, 'storage.position') && 'Vị trí ' + text(document, 'storage.position')].filter(Boolean).join(' · ');

  return <JourneyScreen title="Xem hợp đồng" action={action}>
    {!source.error && !source.loading && <CustomerRenewalDocuments contract={row} />}
    {source.error ? <ErrorState message={source.error} onRetry={source.refresh} />
      : source.loading ? <LoadingState layout="detail" />
      : !available ? <ErrorState message="Chưa có nội dung hợp đồng để hiển thị." onRetry={source.refresh} />
      : <DocumentPaper title="Hợp đồng thuê kho tự quản" meta={[text(document, 'contractCode'), text(document, 'version')].filter(Boolean).join(' · ')}>
        {document.legacySnapshotUnavailable ? <JourneyNotice title="Bản đối chiếu hồ sơ cũ" message="Hồ sơ này thiếu bản nội dung gốc đã ký." />
          : issuer.draft !== false ? <JourneyNotice title="Bản dự thảo" message="Bên cho thuê chưa hoàn tất thông tin pháp nhân hoặc phê duyệt phát hành." /> : null}
        <Section title="Bên cho thuê" values={[
          ['Tên pháp nhân', text(issuer, 'legalName') || 'Chưa có thông tin phát hành'],
          ['Mã số thuế', text(issuer, 'taxCode')], ['Địa chỉ pháp nhân', text(issuer, 'address')], ['Người đại diện', text(issuer, 'representative')],
        ]} />
        <Section title="Khách thuê" values={[
          ['Họ và tên', text(document, 'customer.fullName')], ['Email', text(document, 'customer.email')], ['Điện thoại', text(document, 'customer.phone')],
        ]} />
        <Section title="Cơ sở thuê kho" values={[
          ['Tên cơ sở', text(facility, 'name')], ['Mã cơ sở', text(facility, 'code')],
          ['Địa chỉ kho', text(facility, 'address')], ['Giờ làm việc', text(facility, 'officeHours')],
          ['Giờ khách truy cập kho', text(facility, 'accessHours')],
        ]} />
        {!text(facility, 'name') && <Section title="Tham chiếu cơ sở trên đơn đặt kho" values={[
          ['Cơ sở', text(bookingFacility, 'name')], ['Địa chỉ hiện tại', text(bookingFacility, 'address')],
        ]} />}
        {transfers.length > 0 && <>
          <Section title="Kho đang thuê sau chuyển kho" values={[
            ['Mã ô kho hiện tại', text(currentUnit, 'unitCode')], ['Vị trí hiện tại', currentLocation],
          ]} />
          <Section title="Lịch sử chuyển kho" values={transfers.map(transfer => [
            text(transfer, 'transferCode') || 'Chuyển kho',
            [(text(transfer, 'fromUnit.unitCode') || '—') + ' → ' + (text(transfer, 'toUnit.unitCode') || '—'),
              formatDate(text(transfer, 'completedAt'), true)].filter(Boolean).join(' · '),
          ])} />
        </>}
        <Section title={transfers.length ? 'Thông tin kho trong hợp đồng gốc' : 'Thông tin kho và thời hạn'} values={[
          ['Đơn đặt kho', text(document, 'reservationReference')], ['Loại kho', text(document, 'storage.name')],
          ['Mã ô kho', text(document, 'storage.unitCode')], ['Vị trí trong cơ sở', location], ['Bắt đầu thuê', formatDate(text(document, 'startDate'))],
          ['Kết thúc kỳ thuê', text(document, 'endDate') ? formatDate(text(document, 'endDate')) + ' (không bao gồm ngày này)' : ''],
        ]} />
        <Section title="Tóm tắt thanh toán" values={[
          ['Cách thanh toán', statusLabel(text(quote, 'paymentPlan'))],
          ['Dự kiến trả lần đầu', contractAmount(initial.totalAmount ?? quote.estimatedInitialAmountDue ??
            object(quote.initialInvoiceEstimate).totalAmount ?? object(quote.initialInvoiceEstimate).amountDue)],
          ['Dự kiến còn lại', Number(initial.remainingAmount) > 0 ? contractAmount(initial.remainingAmount) : ''],
          ['Tổng dự kiến cả kỳ', contractAmount(quote.quotedTotalAmount ?? quote.totalAmount ?? quote.grandTotal)],
        ]} />
        {Object.keys(quote).length > 0 ? <Section title="Báo giá đính kèm" values={[
          ['Phạm vi', text(document, 'quantity') ? text(document, 'quantity') + ' kho trong cùng đơn đặt' : 'Đơn đặt kho'],
          [quote.billingMode === 'DAILY' ? 'Đơn giá mỗi kho/ngày' : 'Đơn giá mỗi kho/tháng', contractAmount(quote.billingMode === 'DAILY' ? quote.dailyUnitPrice : quote.monthlyUnitPrice)],
          ...(lines.length ? lines.map(line => [text(line, 'label', 'name') || 'Khoản phí', [contractAmount(line.amount ?? line.totalAmount), text(line, 'basis')].filter(Boolean).join(' · ')] as [string, string]) : [
            ['Tiền thuê trước giảm giá', contractAmount(quote.baseRentalAmount)], ['Giảm giá', contractAmount(quote.discountAmount)],
            ['Tiền thuê sau giảm giá', contractAmount(quote.rentalAmount)], ['Tiền cọc', contractAmount(quote.depositAmount)],
          ] as [string, string][]),
        ]} /> : null}
        {rows(document.services).map((service, index) => <View key={index} style={s.line}>
          <Text style={s.body}>{[text(service, 'name'), text(service, 'quantity')].filter(Boolean).join(' × ')}</Text>
          <Text style={s.body}>{contractAmount(service.amount)}</Text>
        </View>)}
        {clauses.map((clause, index) => <View key={index} style={s.section}>
          <Text accessibilityRole="header" style={s.heading}>{text(clause, 'title')}</Text>
          <Text selectable style={s.body}>{text(clause, 'text')}</Text>
        </View>)}
        <DocumentSignature terms={terms} />
      </DocumentPaper>}
  </JourneyScreen>;
}
