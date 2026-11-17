import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/use-auth';
import { useResource } from '@/operations/use-resource';
import { at, label, object, text, type Row } from '@/operations/model';
import { Disclosure, Panel, money } from '@/operations/ui';
import { RecordView } from '@/operations/record-view';
import { staffStyles as s, StaffStatusBadge } from '@/components/staff-ui';
import { StaffInfoGrid } from '@/components/staff-info-grid';
import { LoadingState, ErrorState, EmptyState } from '@/components/screen-state';
import { DocumentFile } from '@/components/document-file';
import { ContractRenewalHistory } from '@/components/contract-renewal-history';
import { ContractTransferHistory } from '@/components/contract-transfer-history';
import { formatDate } from '@/utils/format';
import { WdpColors as C } from '@/constants/wdp-theme';

const tabs = [['contract', 'Hợp đồng'], ['storage', 'Kho'], ['pricing', 'Giá'], ['history', 'Lịch sử']] as const;
export default function StaffContractDetailsScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const data = useResource<Row>(user?.role === 'STAFF' && id ? '/staff/management/contracts/' + encodeURIComponent(id) : null);
  const [tab, setTab] = useState('contract');
  const row = data.data;
  const quote = object(row?.reservationPricing);
  const date = (path: string) => row && text(row, path) ? formatDate(text(row, path)) : undefined;
  const amount = (path: string) => typeof quote[path] === 'number' ? money(quote[path]) : undefined;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[s.page, { gap: 12, paddingBottom: 24 }]}>
    {user?.role !== 'STAFF' ? <EmptyState title="Không có quyền truy cập" message="Mở lại khu vực Staff." /> : data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : row && <>
      <View style={{ gap: 6 }}><Text style={s.section}>{text(row, 'reservation.customer.fullName') || 'Hợp đồng thuê kho'}</Text><Text selectable style={s.secondary}>{text(row, 'contractCode')}</Text><StaffStatusBadge status={String(row.status)} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{tabs.map(([key, title]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: key === tab }} onPress={() => setTab(key)} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: key === tab ? C.navy : C.surface }}><Text style={[s.secondary, { color: key === tab ? C.surface : C.navy }]}>{title}</Text></Pressable>)}</ScrollView>
      {tab === 'contract' && <><Panel title="Thời hạn và hồ sơ"><StaffInfoGrid values={[["Bắt đầu", date('startDate')], ['Kết thúc (không gồm ngày này)', date('endDate')], ['Kho', text(row, 'storageUnit.unitCode')], ['Loại kho', text(row, 'storageType.name')], ['Khách hàng', text(row, 'reservation.customer.fullName')], ['Điện thoại', text(row, 'reservation.customer.phone')], ['Tình trạng ký', at(row, 'terms.acceptedAt') ? 'Đã ký' : 'Chưa ghi nhận chữ ký']]} /></Panel><DocumentFile path={'/staff/management/documents/contracts/' + encodeURIComponent(id)} name={text(row, 'contractCode')} /><Disclosure title="Điều khoản và chứng thực"><RecordView row={object(row.terms)} root="/staff" /></Disclosure></>}
      {tab === 'storage' && <Panel title="Vị trí kho"><StaffInfoGrid values={[["Mã kho", text(row, 'storageUnit.unitCode')], ['Tầng', text(row, 'storageUnit.floor')], ['Khu', text(row, 'storageUnit.zone')], ['Dãy', text(row, 'storageUnit.row')], ['Vị trí', text(row, 'storageUnit.position')], ['Tình trạng kho', label(at(row, 'storageUnit.physicalStatus'))]]} /></Panel>}
      {tab === 'pricing' && <><Panel title="Giá đã chốt của đơn thuê"><StaffInfoGrid values={[["Tổng báo giá", amount('quotedTotalAmount') ?? amount('grandTotal')], ['Tiền thuê', amount('rentalSubtotal') ?? amount('baseRentalAmount')], ['Tiền cọc', amount('depositAmount') ?? amount('deposit')], ['Dự kiến ban đầu', typeof at(quote, 'initialPaymentBreakdown.totalAmount') === 'number' ? money(at(quote, 'initialPaymentBreakdown.totalAmount')) : undefined]]} /></Panel><Disclosure title="Chi tiết báo giá và dịch vụ"><RecordView row={{ quote, services: row.services }} root="/staff" /></Disclosure></>}
      {tab === 'history' && <><ContractRenewalHistory contract={row} scope="staff/management" /><ContractTransferHistory contract={row} scope="staff/management" /><Disclosure title="Các mốc xử lý"><RecordView row={{ createdAt: row.createdAt, updatedAt: row.updatedAt, activatedAt: row.activatedAt, completedAt: row.completedAt }} root="/staff" /></Disclosure></>}
      <Disclosure title="Định danh kỹ thuật"><StaffInfoGrid values={[["Mã dữ liệu hợp đồng", row.id], ['Mã dữ liệu đơn thuê', at(row, 'reservation.id')], ['Mã dữ liệu kho', at(row, 'storageUnit.id')]]} /></Disclosure>
    </>}
  </ScrollView>;
}
