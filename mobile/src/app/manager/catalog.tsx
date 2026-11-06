import { ManagerParentLink } from '@/operations/manager-parent-link';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { OperationForm, type FormAction } from '@/operations/form';
import { storageTypeAction } from '@/operations/inventory-actions';
import { rows, text, type Row } from '@/operations/model';
import { Button, Disclosure, Navigation, Panel, money, styles } from '@/operations/ui';
import { useResource } from '@/operations/use-resource';
import { Availability } from '@/operations/availability';

export default function Catalog() {
  const { user } = useAuth();
  const data = useResource<Row>(user?.role === 'MANAGER' ? '/manager/storage-types' : null);
  const [action, setAction] = useState<FormAction>(), [notice, setNotice] = useState('');
  if (user?.role !== 'MANAGER') return <EmptyState title="Không có quyền truy cập" message="Chỉ quản lý cơ sở được sửa danh mục." />;
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
    <PageHeader eyebrow="Quản lý cơ sở" title="Loại kho & bảng giá" description="Giá mới áp dụng cho báo giá mới." />
    <ManagerParentLink resource="catalog" />
    {notice ? <Text accessibilityRole="alert" style={styles.success}>{notice}</Text> : null}
    {action ? <OperationForm key={action.path} action={action} onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); setNotice('Đã lưu.'); data.refresh(); }} /> : <>
      <Button title="Thêm loại kho" disabled={!data.data || data.loading} onPress={() => setAction(storageTypeAction(undefined, rows(data.data?.facilities)))} />
      <Button title="Làm mới" variant="secondary" disabled={data.loading} onPress={data.refresh} />
      <Navigation title="Dịch vụ bổ sung" path="/manager/additional-services" />
      {data.data && <Disclosure title="Kiểm tra kho trống"><Availability catalog={{ products: rows(data.data.items) }} root="/manager" /></Disclosure>}
      {data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : rows(data.data?.items).map(item => <Panel key={text(item, 'id')} title={text(item, 'name')}>
        <Text style={styles.copy}>{text(item, 'code')} · {text(item, 'sizeName')}</Text>
        <Text style={styles.copy}>{text(item, 'widthCm')} × {text(item, 'lengthCm')} × {text(item, 'heightCm')} cm</Text>
        <Text style={styles.title}>{money(item.monthlyRate)}/tháng</Text>
        <Text style={styles.copy}>{item.condition === 'AIR_CONDITIONED' ? 'Điều hòa' : 'Tiêu chuẩn'} · {item.allowDailyRental ? `Thuê ngày từ ${text(item, 'minRentalDays')} ngày` : 'Thuê theo tháng'}</Text>
        <Button title="Sửa loại kho & giá" variant="secondary" onPress={() => setAction(storageTypeAction(item, rows(data.data?.facilities)))} />
      </Panel>)}
    </>}
  </ScrollView>;
}
