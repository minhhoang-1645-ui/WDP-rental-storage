import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { ActionButton, Field, MenuLink, SelectField, portalStyles } from '@/components/portal-ui';
import { RecordCard } from '@/components/record-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { usePortalResource } from '@/hooks/use-portal-resource';
import type { Paginated } from '@/types/api';
import type { AdminUser } from '@/types/management';
import { statusLabel } from '@/utils/format';

export default function AdminUsers() {
  const [query, setQuery] = useState({ page: 1, search: '', role: '', accountStatus: '' });
  const [search, setSearch] = useState('');
  const params = new URLSearchParams({ page: String(query.page), limit: '20' });
  if (query.search) params.set('search', query.search);
  if (query.role) params.set('role', query.role);
  if (query.accountStatus) params.set('accountStatus', query.accountStatus);
  const result = usePortalResource<Paginated<AdminUser>>(`/admin/users?${params}`);
  const data = result.data;
  return <FlatList data={data?.items ?? []} keyExtractor={item => item.id} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={portalStyles.content}
    refreshControl={<RefreshControl refreshing={result.refreshing} onRefresh={result.refresh} />}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      <MenuLink href="/admin/users/new" title="Tạo tài khoản" description="Thêm Staff hoặc Manager." />
      <Field label="Tên, email hoặc số điện thoại" defaultValue={search} onChangeText={setSearch} maxLength={120} returnKeyType="search" onSubmitEditing={() => setQuery({ ...query, search: search.trim(), page: 1 })} />
      <ActionButton label="Tìm kiếm" secondary onPress={() => setQuery({ ...query, search: search.trim(), page: 1 })} />
      <SelectField label="Vai trò" value={query.role} options={[{ value: '', label: 'Tất cả vai trò' }, ...['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN'].map(value => ({ value, label: statusLabel(value) }))]} onChange={role => setQuery({ ...query, role, page: 1 })} />
      <SelectField label="Trạng thái tài khoản" value={query.accountStatus} options={[{ value: '', label: 'Tất cả trạng thái' }, { value: 'ACTIVE', label: 'Đang hoạt động' }, { value: 'DISABLED', label: 'Đã vô hiệu hóa' }]} onChange={accountStatus => setQuery({ ...query, accountStatus, page: 1 })} />
      {result.error ? <ErrorState message={result.error} onRetry={result.refresh} /> : null}
      {data ? <Text style={portalStyles.muted}>{data.total} tài khoản · Trang {data.page}/{Math.max(1, Math.ceil(data.total / data.limit))}</Text> : null}
    </View>}
    ListEmptyComponent={result.loading ? <LoadingState /> : result.error ? null : <EmptyState title="Không tìm thấy tài khoản" message="Thử thay đổi từ khóa hoặc bộ lọc." />}
    renderItem={({ item }) => <RecordCard code={item.email} title={item.fullName} status={item.accountStatus === 'ACTIVE' ? 'ACCOUNT_ACTIVE' : 'DISABLED'} detail={`${statusLabel(item.role)} · ${item.phone || 'Chưa có số điện thoại'}`} onPress={() => router.push({ pathname: '/admin/users/[id]', params: { id: item.id } })} />}
    ListFooterComponent={data ? <View style={{ gap: 8 }}>
      <ActionButton label="Trang trước" secondary disabled={query.page <= 1 || result.refreshing} onPress={() => setQuery({ ...query, page: query.page - 1 })} />
      <ActionButton label="Trang tiếp" secondary disabled={query.page * data.limit >= data.total || result.refreshing} onPress={() => setQuery({ ...query, page: query.page + 1 })} />
    </View> : null}
  />;
}

