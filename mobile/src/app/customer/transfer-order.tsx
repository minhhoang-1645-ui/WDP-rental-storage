import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { DocumentAcceptance } from '@/components/document-acceptance';
import { JourneyScreen } from '@/components/customer-journey-ui';
import { StatusBadge } from '@/components/customer-ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { object, rows, text, type Row } from '@/operations/model';
import { Disclosure, Facts, Navigation, Panel, styles } from '@/operations/ui';
import { useResource } from '@/operations/use-resource';
import { formatDate, formatMoney } from '@/utils/format';

function TransferOrder({ id }: { id: string }) {
  const source = useResource<Row>('/customer/transfer-orders/' + encodeURIComponent(id), false, true);
  const row = source.data;
  const status = text(row ?? {}, 'status');
  const accepted = text(row ?? {}, 'commercial.acceptedAt');
  const from = text(row ?? {}, 'fromUnit.unitCode');
  const to = text(row ?? {}, 'toUnit.unitCode');
  const snapshot = object(object(row?.commercial).snapshot);
  const review = object(snapshot.financialReview);
  const payment = object(row?.commercialPayment);
  const dueInvoices = rows(payment.dueInvoices);
  const dueAmount = dueInvoices.reduce((total, invoice) => total + Number(invoice.balanceDue), 0);
  const leaseEnd = text(review, 'leaseEnd') || text(row ?? {}, 'contract.endDate');
  const effectiveFrom = text(snapshot, 'effectiveFrom');
  const nextRenewal = Boolean(leaseEnd && effectiveFrom >= leaseEnd);
  return <JourneyScreen title="Phụ lục chuyển kho">
    {source.error ? <ErrorState message={source.error} onRetry={source.refresh} />
      : source.loading ? <LoadingState layout="detail" />
        : row ? <>
          <Panel title={[from, to].filter(Boolean).join(' → ')}>
            <StatusBadge status={status === 'COMPLETED' ? 'Đã chuyển kho' : accepted ? 'Đã ký phụ lục' : status === 'APPROVED' ? 'Chờ ký phụ lục' : status} tone={accepted ? 'success' : undefined} />
            <Facts values={[
              ['Ngày duyệt', text(row, 'approvedAt') ? formatDate(text(row, 'approvedAt')) : ''],
            ]} />
          </Panel>
          <Panel title="Điều kiện thuê">
            <Facts values={[
              ['Hạn thuê giữ nguyên', leaseEnd ? formatDate(leaseEnd) : ''],
              ['Giá hiện tại / tháng', typeof snapshot.currentRate === 'number' ? formatMoney(snapshot.currentRate) : ''],
              [nextRenewal ? 'Giá nếu gia hạn tiếp / tháng' : 'Giá mới từ ' + formatDate(effectiveFrom) + ' / tháng', typeof snapshot.newRate === 'number' ? formatMoney(snapshot.newRate) : ''],
              ['Điều chỉnh kỳ hiện tại', snapshot.currentPeriodUnchanged === true ? formatMoney(0) : ''],
            ]} />
            {row.commercialPayment ? <Text style={styles.copy}>{dueInvoices.length ? `Cần thanh toán ${formatMoney(dueAmount)} trước bàn giao.`
              : payment.pendingRenewalInvoice ? 'Hóa đơn kỳ gia hạn đang chờ đối soát.' : 'Hiện không có khoản đến hạn cần trả trước bàn giao.'}</Text> : null}
            {Boolean(snapshot.financialReview || dueInvoices.length) && <Disclosure title="Xem chi tiết thanh toán">
              {snapshot.financialReview ? <Facts values={[
                ['Đã trả khi lập phụ lục', formatMoney(Number(review.paidAmount))],
                ['Tổng còn phải trả khi lập phụ lục', formatMoney(Number(review.outstandingAmount))],
                ['Cọc giữ nguyên', formatMoney(Number(review.depositAmount))],
                ['Điều chỉnh tiền thuê kỳ sau', formatMoney(Number(review.futureRentIncrease) - Number(review.futureRentReduction))],
              ]} /> : null}
              {dueInvoices.map(invoice => <Navigation key={text(invoice, 'id')} title={`Hóa đơn ${text(invoice, 'code')}`}
                description={formatMoney(Number(invoice.balanceDue))} path={'/customer/invoices/' + encodeURIComponent(text(invoice, 'id'))} />)}
            </Disclosure>}
          </Panel>
          {status === 'APPROVED' || accepted ? <DocumentAcceptance row={row} resource="transfer-orders" onSaved={source.refresh} />
            : <Text>Phụ lục chưa khả dụng để ký.</Text>}
        </> : <EmptyState title="Không tìm thấy phụ lục chuyển kho" message="" />}
  </JourneyScreen>;
}

export default function CustomerTransferOrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  return orderId ? <TransferOrder key={orderId} id={orderId} />
    : <JourneyScreen title="Phụ lục chuyển kho"><EmptyState title="Không tìm thấy phụ lục chuyển kho" message="" /></JourneyScreen>;
}
