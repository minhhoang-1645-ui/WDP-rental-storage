import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { PageHeader } from '@/components/page-header';
import { OperationForm, type FormAction } from './form';
import { rows, text, type Row } from './model';
import { useResource } from './use-resource';
import { Button, Panel, styles } from './ui';

export function UnitStaffAssignments() {
  const { user } = useAuth();
  const manager = user?.role === 'MANAGER';
  const source = useResource<Row>(manager ? '/manager/unit-staff-assignments' : user?.role === 'STAFF' ? '/staff/assigned-units' : null);
  const [form, setForm] = useState<FormAction>();
  const start = (assignment?: Row) => setForm({ title: 'Phân công người phụ trách kho', path: '/manager/units', resolvePath: input => `/manager/units/${encodeURIComponent(String(input.storageUnitId))}/staff-assignment`, method: 'PATCH', fields: [
    { name: 'storageUnitId', title: 'Kho', required: true, optionsPath: '/manager/units', initial: text(assignment ?? {}, 'storageUnitId'), fixed: Boolean(assignment), optionLabel: unit => `${text(unit, 'unitCode')} · ${text(unit, 'storageType.name')} · ${text(unit, 'floor')} ${text(unit, 'zone')}` },
    { name: 'staffUserId', title: 'Nhân viên phụ trách', required: true, optionsPath: '/manager/staff', optionLabel: staff => `${text(staff, 'fullName')} · ${text(staff, 'email')}` },
    { name: '_confirmed', title: 'Tôi xác nhận giao kho cho nhân viên này', required: true, checkbox: true, clientOnly: true },
  ], transform: input => ({ staffUserId: input.staffUserId, expectedAssignmentId: assignment?.id ?? rows(source.data?.items).find(item => item.storageUnitId === input.storageUnitId)?.id ?? null }) });
  return <Panel title={manager ? 'Nhân viên phụ trách từng kho' : 'Kho bạn phụ trách'}>
    {source.loading ? <LoadingState /> : source.error ? <ErrorState message={source.error} onRetry={source.refresh} /> : source.data?.enabled === false ? <Text style={styles.copy}>Phân công cố định theo kho chưa được bật. Công việc được giao hiện tại vẫn nằm trong các phân hệ nghiệp vụ.</Text> : <>
      {manager && !form && <Button title="Giao kho cho nhân viên" onPress={() => start()} />}
      {form && <OperationForm action={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); source.refresh(); }} />}
      {rows(source.data?.items).map(item => <Panel key={text(item, 'id')} title={text(item, 'storageUnit.unitNumber')}><Text style={styles.copy}>{text(item, 'storageUnit.floor')} · {text(item, 'storageUnit.zone')} · {text(item, 'staff.fullName')}</Text>{manager && !form && <Button title="Đổi người phụ trách kho" variant="secondary" onPress={() => start(item)} />}</Panel>)}
      {!rows(source.data?.items).length && <EmptyState title="Chưa có phân công theo kho" message={manager ? 'Chọn kho và nhân viên đang hoạt động để phân công.' : 'Quản lý sẽ giao kho bạn phụ trách.'} />}
    </>}
  </Panel>;
}
export function StaffAssignedUnits() { return <ScrollView contentContainerStyle={styles.page}><PageHeader eyebrow="Nhân viên" title="Kho tôi phụ trách" description="Phân công theo từng kho do quản lý thiết lập." /><UnitStaffAssignments /></ScrollView>; }
