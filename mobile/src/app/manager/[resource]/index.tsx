import { router, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { ActionButton, Field, SelectField, portalStyles } from '@/components/portal-ui';
import { RecordCard } from '@/components/record-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { usePortalResource } from '@/hooks/use-portal-resource';
import { displayField, operationCatalog, recordId, recordStatus, type OperationConfig } from '@/services/operation-catalog';
import type { Paginated } from '@/types/api';
import type { OperationRecord } from '@/types/management';
import { statusLabel } from '@/utils/format';

export default function OperationListRoute() {
  const { resource } = useLocalSearchParams<{ resource: string }>();
  const config = Object.hasOwn(operationCatalog, resource) ? operationCatalog[resource] : undefined;
  if (!config) return <View style={portalStyles.content}><EmptyState title="Không tìm thấy mục này" message="Hãy quay về tổng quan quản lý." /></View>;
  return <OperationList key={resource} resource={resource} config={config} />;
}

function OperationList({ resource, config }: { resource: string; config: OperationConfig }) {
  const [query, setQuery] = useState({ page: 1, search: '', status: '' });
  const [draftSearch, setDraftSearch] = useState('');
  const params = new URLSearchParams({ page: String(query.page), limit: '20' });
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  const result = usePortalResource<Paginated<OperationRecord>>(`/manager/${resource}?${params}`);
  const data = result.data;
  return <FlatList
    data={data?.items ?? []}
    keyExtractor={recordId}
    contentInsetAdjustmentBehavior="automatic"
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={portalStyles.content}
    refreshControl={<RefreshControl refreshing={result.refreshing} onRefresh={result.refresh} />}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      <Stack.Screen options={{ title: config.title }} />
      <Text style={portalStyles.muted}>{config.description}</Text>
      {config.search ? <>
        <Field label="Tìm theo mã, tên hoặc thông tin hồ sơ" defaultValue={draftSearch} onChangeText={setDraftSearch} maxLength={100} returnKeyType="search" onSubmitEditing={() => setQuery({ ...query, page: 1, search: draftSearch.trim() })} />
        <ActionButton label="Tìm kiếm" secondary onPress={() => setQuery({ ...query, page: 1, search: draftSearch.trim() })} />
      </> : null}
      {config.statuses ? <SelectField label="Trạng thái" value={query.status} options={[{ value: '', label: 'Tất cả' }, ...config.statuses.map(value => ({ value, label: statusLabel(value) }))]} onChange={status => setQuery({ ...query, page: 1, status })} /> : null}
      {result.error ? <ErrorState message={result.error} onRetry={result.refresh} /> : null}
      {data ? <Text style={portalStyles.muted}>{data.total} hồ sơ · Trang {data.page}/{Math.max(1, Math.ceil(data.total / data.limit))}</Text> : null}
    </View>}
    ListEmptyComponent={result.loading ? <LoadingState /> : result.error ? null : <EmptyState title="Không có hồ sơ phù hợp" message="Thử đổi bộ lọc hoặc kéo xuống để tải lại." />}
    renderItem={({ item }) => <RecordCard
      code={displayField(item, { label: '', path: config.code })}
      title={displayField(item, { label: '', path: config.heading })}
      status={recordStatus(item, config)}
      detail={config.summary.map(field => `${field.label}: ${displayField(item, field)}`).join('\n')}
      onPress={() => router.push({ pathname: '/manager/[resource]/[id]', params: { resource, id: recordId(item) } })}
    />}
    ListFooterComponent={data ? <View style={{ gap: 8 }}>
      <ActionButton label="Trang trước" secondary disabled={query.page <= 1 || result.refreshing} onPress={() => setQuery({ ...query, page: query.page - 1 })} />
      <ActionButton label="Trang tiếp" secondary disabled={query.page * data.limit >= data.total || result.refreshing} onPress={() => setQuery({ ...query, page: query.page + 1 })} />
    </View> : null}
  />;
}

