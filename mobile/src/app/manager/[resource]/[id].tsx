import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { OperationActions } from '@/components/operation-actions';
import { InfoRow, Panel, portalStyles } from '@/components/portal-ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { usePortalResource } from '@/hooks/use-portal-resource';
import { displayField, operationCatalog, readField, recordStatus, type OperationConfig } from '@/services/operation-catalog';
import type { OperationRecord } from '@/types/management';
import { statusLabel } from '@/utils/format';

export default function OperationDetailRoute() {
  const { resource, id } = useLocalSearchParams<{ resource: string; id: string }>();
  const config = Object.hasOwn(operationCatalog, resource) ? operationCatalog[resource] : undefined;
  if (!config || !id) return <View style={portalStyles.content}><EmptyState title="Không tìm thấy hồ sơ" message="Hãy quay về danh sách." /></View>;
  return <OperationDetail key={`${resource}:${id}`} resource={resource} id={id} config={config} />;
}

function OperationDetail({ resource, id, config }: { resource: string; id: string; config: OperationConfig }) {
  const result = usePortalResource<OperationRecord>(`/manager/${resource}/${encodeURIComponent(id)}`);
  const data = result.data;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={portalStyles.content} refreshControl={<RefreshControl refreshing={result.refreshing} onRefresh={result.refresh} />}>
    <Stack.Screen options={{ title: config.title }} />
    {result.loading ? <LoadingState /> : null}
    {result.error ? <ErrorState message={result.error} onRetry={result.refresh} /> : null}
    {data ? <>
      <Panel title={displayField(data, { label: '', path: config.code })}>
        <Text style={portalStyles.title}>{statusLabel(recordStatus(data, config))}</Text>
        {config.fields.map(field => <InfoRow key={field.label} label={field.label} value={displayField(data, field)} />)}
      </Panel>
      <OperationActions resource={resource} id={id} data={data} disabled={result.refreshing || Boolean(result.error)} onSuccess={result.refresh} />
      {config.related?.map(group => {
        const values = readField(data, group.path);
        const records = Array.isArray(values) ? values.filter((item): item is OperationRecord => Boolean(item && typeof item === 'object')) : [];
        return <Panel key={group.path} title={group.title}>
          {records.length ? records.map((record, index) => <View key={String(record.id ?? index)} style={{ borderTopWidth: 1, borderColor: '#DCE4EC', paddingTop: 8 }}>
            {group.fields.map(field => <InfoRow key={field.label} label={field.label} value={displayField(record, field)} />)}
          </View>) : <Text style={portalStyles.muted}>Chưa có dữ liệu liên quan.</Text>}
        </Panel>;
      })}
    </> : null}
  </ScrollView>;
}

