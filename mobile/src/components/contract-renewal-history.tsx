import { Text, View } from 'react-native';
import { DocumentFile } from './document-file';
import { object, rows, text, label } from '@/operations/model';
import { Panel, styles, money } from '@/operations/ui';
import { formatDate } from '@/utils/format';

export function ContractRenewalHistory({ contract: value, scope }: { contract: unknown; scope: 'customer' | 'manager' | 'staff/management' }) {
  const contract = object(value), renewals = rows(contract.renewals);
  if (!renewals.length) return null;
  return <Panel title="Lịch sử gia hạn của hợp đồng">
    <Text style={styles.copy}>Hạn thuê hiện tại: {formatDate(text(contract, 'endDate'))}. Chỉ áp dụng hạn mới sau chấp thuận, ký phụ lục và thanh toán kích hoạt.</Text>
    {renewals.map(renewal => <View key={text(renewal, 'id')} style={{ gap: 8, marginVertical: 10 }}>
      <Text style={styles.label}>{text(renewal, 'renewalCode')} · {label(renewal.status)}</Text>
      <Text style={styles.copy}>Hạn cũ: {formatDate(text(renewal, 'previousEndDate'))} → Đề nghị đến: {formatDate(text(renewal, 'requestedEndDate'))} · Thêm {text(renewal, 'termMonths')} tháng</Text>
      <Text style={styles.copy}>Tổng tiền gia hạn của đơn thuê: {money(object(renewal.quote).totalAmount)} · {label(renewal.paymentPlan)}</Text>
      <Text style={styles.copy}>Gửi: {formatDate(text(renewal, 'requestedAt'), true)} · {text(renewal, 'requestedBy.fullName') || 'Chưa ghi nhận'}</Text>
      {Boolean(renewal.reviewedAt) && <Text style={styles.copy}>Xét duyệt: {formatDate(text(renewal, 'reviewedAt'), true)} · {text(renewal, 'reviewedBy.fullName') || 'Hệ thống / hồ sơ cũ chưa ghi người duyệt'}</Text>}
      {Boolean(renewal.rejectionReason) && <Text style={styles.copy}>Lý do từ chối: {text(renewal, 'rejectionReason')}</Text>}
      <Text style={styles.copy}>{renewal.status === 'COMPLETED' ? `Đã áp dụng hạn mới${renewal.activatedAt ? ` từ ${formatDate(text(renewal, 'activatedAt'), true)}` : ''}.` : 'Chưa áp dụng hạn mới. Kiểm tra duyệt, chữ ký và khoản thanh toán kích hoạt.'}</Text>
      {Boolean(renewal.appendix) && <Text style={styles.copy}>Phụ lục {text(renewal, 'appendix.code')} · {text(renewal, 'appendix.acceptedAt') ? `Đã ký bởi ${text(renewal, 'appendix.acceptanceName')} lúc ${formatDate(text(renewal, 'appendix.acceptedAt'), true)}` : 'Chưa ký'}</Text>}
      {rows(renewal.invoices).map(invoice => <Text key={text(invoice, 'id')} style={styles.copy}>Hóa đơn {text(invoice, 'invoiceCode')} · {label(invoice.status)} · Giá trị: {money(invoice.totalAmount)} · Đã trả: {money(invoice.amountPaid)} · Còn lại: {money(invoice.balanceDue)}{invoice.paidAt ? ` · Thanh toán đủ ${formatDate(text(invoice, 'paidAt'), true)}` : ''}</Text>)}
      {object(renewal.appendix).available === true && <DocumentFile path={`/${scope}/documents/renewals/${encodeURIComponent(text(renewal, 'id'))}`} name={text(renewal, 'appendix.code')} />}
    </View>)}
  </Panel>;
}
