import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useAuth } from '@/auth/use-auth';
import { StaffStatusFilters, StaffTaskRow, staffStyles as s } from '@/components/staff-ui';
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
  const data = useResource<Row>(allowed ? '/staff/transfers' : null, true);
  const [search, setSearch] = useState(''), [status, setStatus] = useState('');
  const items = rows(data.data?.items).filter(row => (!status || row.status === status) && recordMatches(row, search));
  const refresh = data.refresh;
  if (!allowed) return <EmptyState title="Không có quyền truy cập" message="Mở lại khu vực Staff." />;
  return <FlatList data={data.loading || data.error ? [] : items} keyExtractor={idOf} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[s.page, { gap: 8, paddingBottom: 24 }]} refreshControl={<RefreshControl refreshing={data.loading} onRefresh={refresh} tintColor={C.navy} />}
    ListHeaderComponent={<View style={{ gap: 8 }}>
      <Field title="Tìm khách hàng, kho hoặc phiếu chuyển" value={search} onChange={setSearch} maxLength={120} />
      <StaffStatusFilters values={['APPROVED', 'COMPLETED']} selected={status} onChange={setStatus} />
      {data.loading ? <LoadingState layout="list" /> : data.error ? <ErrorState message={data.error} onRetry={refresh} /> : null}
    </View>}
    renderItem={({ item }) => <StaffTaskRow resource="transfers" row={item} titleOverride={text(item, 'customer.fullName', 'reservation.customer.fullName') || undefined} path={`/staff/transfers/${encodeURIComponent(idOf(item))}`} />}
    ListEmptyComponent={!data.loading && !data.error ? <EmptyState title="Không có hồ sơ phù hợp" message="Thử đổi từ khóa hoặc trạng thái." /> : undefined}
  />;
}
