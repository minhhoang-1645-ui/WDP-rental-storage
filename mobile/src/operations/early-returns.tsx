import { ManagerParentLink } from '@/operations/manager-parent-link';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { OperationForm, type FormAction } from './form';
import { idOf, rows, text, type Row } from './model';
import { useResource } from './use-resource';
import { Button, Facts, Panel, styles } from './ui';
import { formatDate, formatMoney } from '@/utils/format';

function reviewAction(item: Row, approved: boolean): FormAction {
  return {
    title: approved ? 'Chấp thuận trả trước hạn' : 'Chưa chấp thuận trả sớm',
    path: `/manager/early-return-requests/${encodeURIComponent(idOf(item))}/decision`, method: 'POST', idempotent: true,
    description: 'Tiền thuê và các khoản hoàn được tính khi nhân viên nhận lại kho.',
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
    <PageHeader onRefresh={data.refresh} eyebrow="Quản lý" title="Đề nghị trả trước hạn" description="Tiền thuê được tính theo ngày nhận lại kho. Tiền cọc được xử lý riêng." />
    <ManagerParentLink resource="early-returns" />

    <Button title={history ? 'Đang xem cả lịch sử · Chỉ xem chờ duyệt' : 'Xem cả đề nghị đã quyết định'} variant="secondary" onPress={() => setHistory(value => !value)} />
    {notice ? <Text accessibilityRole="alert" style={styles.success}>{notice}</Text> : null}
    {action && <OperationForm key={action.path + action.title} action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã phản hồi đề nghị trả trước hạn cho khách.'); data.refresh(); }} />}
    {data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : !items.length ? <EmptyState title="Không có đề nghị phù hợp" message="Đề nghị mới của khách sẽ xuất hiện tại đây." /> : items.map(item => <Panel key={idOf(item)} title={`${text(item, 'customer.fullName')} · ${text(item, 'supportCode')}`}>
      <Facts values={[
        ['Liên hệ', text(item, 'customer.phone', 'customer.email')], ['Yêu cầu thuê', text(item, 'reservation.reference')],
        ['Kho đang thuê', rows(item.contracts).map(contract => `${text(contract, 'unitCode')} (${text(contract, 'contractCode')})`).join(', ')],
        ['Hạn thuê hiện tại', formatDate(text(item, 'reservation.effectiveEndDate'))], ['Lý do', text(item, 'description')],
        ['Còn phải thu dự kiến', text(item, 'estimate.outstandingAmount') ? formatMoney(Number(text(item, 'estimate.outstandingAmount'))) : 'Chưa xác định'],
      ]} />
      {item.decision ? <Text style={styles.copy}>{item.decision === 'APPROVED' ? 'Đã chấp thuận đề nghị' : 'Chưa chấp thuận'} · {text(item, 'resolutionNote')}</Text> : <><Button title="Chấp thuận trả trước hạn" disabled={Boolean(action)} onPress={() => setAction(reviewAction(item, true))} /><Button title="Chưa chấp thuận" variant="secondary" disabled={Boolean(action)} onPress={() => setAction(reviewAction(item, false))} /></>}
    </Panel>)}
  </ScrollView>;
}
