import { useState } from 'react';
import { router } from 'expo-router';
import { ArrowRight, PackagePlus } from 'lucide-react-native';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { StaffStatusFilters, StaffTaskRow, staffStyles as s } from '@/components/staff-ui';
import { isTransferRequest } from '@/utils/transfer-request';
import { recordMatches } from '@/utils/record-search';
import { isStaffWorkflow } from '@/utils/operation-access';
import { idOf, rows, text, type Row } from './model';
import { useResource } from './use-resource';
import { Field } from './ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { WdpColors as C } from '@/constants/wdp-theme';

export function StaffTransfers() {
  const { user } = useAuth();
  const allowed = user?.role === 'STAFF' && isStaffWorkflow('transfers');
  const orders = useResource<Row>(allowed ? '/manager/transfers' : null, true);
  const requests = useResource<Row>(allowed ? '/manager/support-requests' : null, true);
  const [tab, setTab] = useState<'requests' | 'orders'>('requests');
  const [requestSearch, setRequestSearch] = useState(''), [orderSearch, setOrderSearch] = useState('');
  const [requestStatus, setRequestStatus] = useState(''), [orderStatus, setOrderStatus] = useState('');
  const data = tab === 'requests' ? requests : orders;
  const search = tab === 'requests' ? requestSearch : orderSearch;
  const status = tab === 'requests' ? requestStatus : orderStatus;
  const items = (tab === 'requests' ? rows(requests.data?.items).filter(isTransferRequest) : rows(orders.data?.items))
    .filter(row => (!status || row.status === status) && recordMatches(row, search));
  const refresh = () => { orders.refresh(); requests.refresh(); };
  if (!allowed) return <EmptyState title="Không có quyền truy cập" message="Mở lại khu vực Staff." />;
  return <FlatList data={data.loading || data.error ? [] : items} keyExtractor={row => `${tab}:${idOf(row)}`} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[s.page, { gap: 8, paddingBottom: 24 }]} refreshControl={<RefreshControl refreshing={data.loading} onRefresh={refresh} tintColor={C.navy} />}
    ListHeaderComponent={<View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: C.surfaceSecondary }}>{([['requests', 'Yêu cầu khách'], ['orders', 'Phiếu chuyển kho']] as const).map(([key, title]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={{ flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8, borderRadius: 10, backgroundColor: tab === key ? C.surface : 'transparent' }}><Text style={[s.secondary, { color: C.navy, fontWeight: '600' }]}>{title}</Text></Pressable>)}</View>
      {tab === 'orders' && <Pressable accessibilityRole="button" accessibilityLabel="Tạo phiếu chuyển kho, mở màn hình riêng" onPress={() => router.push('/staff/create-transfer')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 64, borderRadius: 12, backgroundColor: pressed ? C.border : C.surfaceSecondary })}><PackagePlus size={24} color={C.navy} /><View style={{ flex: 1, gap: 2 }}><Text style={[s.body, { color: C.navy, fontWeight: '600' }]}>Tạo phiếu chuyển kho</Text><Text style={s.secondary}>Chọn hợp đồng và lý do chuyển</Text></View><ArrowRight size={20} color={C.navy} /></Pressable>}
      <Field title={tab === 'requests' ? 'Tìm khách hàng, kho hoặc yêu cầu' : 'Tìm khách hàng, kho hoặc phiếu chuyển'} value={search} onChange={tab === 'requests' ? setRequestSearch : setOrderSearch} maxLength={120} />
      <StaffStatusFilters values={tab === 'requests' ? ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'] : ['REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED']} selected={status} onChange={tab === 'requests' ? setRequestStatus : setOrderStatus} />
      {data.loading ? <LoadingState layout="list" /> : data.error ? <ErrorState message={data.error} onRetry={refresh} /> : null}
    </View>}
    renderItem={({ item }) => <StaffTaskRow resource={tab === 'requests' ? 'support-requests' : 'transfers'} row={item} titleOverride={text(item, 'customer.fullName', 'reservation.customer.fullName') || undefined} path={`/staff/${tab === 'requests' ? 'support-requests' : 'transfers'}/${encodeURIComponent(idOf(item))}`} />}
    ListEmptyComponent={!data.loading && !data.error ? <EmptyState title="Không có hồ sơ phù hợp" message="Thử đổi từ khóa hoặc trạng thái." /> : undefined}
  />;
}
