import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { OperationForm, type FormAction } from './form';
import { idOf, rows, text, type Row } from './model';
import { useResource } from './use-resource';
import { Button, Facts, Navigation, Panel, styles } from './ui';
import { formatDate, formatMoney } from '@/utils/format';

function reviewAction(item: Row, approved: boolean): FormAction {
  return {
    title: approved ? 'Chấp thuận trả trước hạn' : 'Chưa chấp thuận trả sớm',
    path: `/manager/early-return-requests/${encodeURIComponent(idOf(item))}/decision`, method: 'POST', idempotent: true,
    description: 'Đối chiếu công nợ và cọc. Quyết định không sửa hóa đơn, tự hoàn tiền thuê hoặc áp phí mới.',
    fields: [
      { name: 'note', title: 'Điều kiện hoặc lý do trả sớm', multiline: true, required: true, minLength: 3, maxLength: 3000 },
      { name: 'financialReviewConfirmed', title: 'Tôi đã đối chiếu công nợ, cọc và điều kiện với hồ sơ hiện tại', checkbox: true, required: approved },
    ],
    transform: input => ({ ...input, decision: approved ? 'APPROVED' : 'REJECTED', reviewedEndDate: text(item, 'reservation.effectiveEndDate'), reviewedOutstandingAmount: Number(text(item, 'financialSummary.outstandingAmount')), reviewedPaidAmount: Number(text(item, 'financialSummary.paidAmount')) }),
  };
}

export function ManagerEarlyReturns() {
  const { user } = useAuth();
  const data = useResource<Row>(user?.role === 'MANAGER' ? '/manager/early-return-requests' : null, true);
  const [history, setHistory] = useState(false), [action, setAction] = useState<FormAction>(), [notice, setNotice] = useState('');
  const items = rows(data.data?.items).filter(item => history || !item.decision);
  return <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Quản lý" title="Đề nghị trả trước hạn" description="Xem xét đề nghị trước khi khách tạo hồ sơ trả kho. Nhân viên kiểm tra và nhận kho sau khi được chấp thuận." />
    <Navigation title="Về tổng quan" path="/manager" />
    <Button title="Làm mới đề nghị" onPress={data.refresh} disabled={data.loading || Boolean(action)} />
    <Button title={history ? 'Đang xem cả lịch sử · Chỉ xem chờ duyệt' : 'Xem cả đề nghị đã quyết định'} variant="secondary" onPress={() => setHistory(value => !value)} />
    {notice ? <Text accessibilityRole="alert" style={styles.success}>{notice}</Text> : null}
    {action && <OperationForm key={action.path + action.title} action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã phản hồi đề nghị trả trước hạn cho khách.'); data.refresh(); }} />}
    {data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : !items.length ? <EmptyState title="Không có đề nghị phù hợp" message="Đề nghị mới của khách sẽ xuất hiện tại đây." /> : items.map(item => <Panel key={idOf(item)} title={`${text(item, 'customer.fullName')} · ${text(item, 'supportCode')}`}>
      <Facts values={[
        ['Liên hệ', text(item, 'customer.phone', 'customer.email')], ['Yêu cầu thuê', text(item, 'reservation.reference')],
        ['Kho đang thuê', rows(item.contracts).map(contract => `${text(contract, 'unitCode')} (${text(contract, 'contractCode')})`).join(', ')],
        ['Hạn thuê hiện tại', formatDate(text(item, 'reservation.effectiveEndDate'))], ['Lý do', text(item, 'description')],
        ['Công nợ hóa đơn hiện có', formatMoney(Number(text(item, 'financialSummary.outstandingAmount')))],
        ['Đã thu theo hóa đơn', formatMoney(Number(text(item, 'financialSummary.paidAmount')))], ['Cọc đã lập hóa đơn', formatMoney(Number(text(item, 'financialSummary.invoicedDeposit')))],
      ]} />
      {item.decision ? <Text style={styles.copy}>{item.decision === 'APPROVED' ? 'Đã chấp thuận' : 'Chưa chấp thuận'} · {text(item, 'resolutionNote')}</Text> : <><Button title="Chấp thuận trả trước hạn" disabled={Boolean(action)} onPress={() => setAction(reviewAction(item, true))} /><Button title="Chưa chấp thuận" variant="secondary" disabled={Boolean(action)} onPress={() => setAction(reviewAction(item, false))} /></>}
    </Panel>)}
  </ScrollView>;
}
