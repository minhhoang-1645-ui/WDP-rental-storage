import { ScrollView } from 'react-native';
import { Stack } from 'expo-router/stack';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/use-auth';
import { isStaffWorkflow } from '@/utils/operation-access';
import { resources, type Row } from '@/operations/model';
import { useResource } from '@/operations/use-resource';
import { StaffRecordSections } from '@/components/staff-record-sections';
import { staffStyles } from '@/components/staff-ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';

export default function StaffRecordSectionScreen() {
  const { user } = useAuth();
  const { resource = '', id = '', section = '' } = useLocalSearchParams<{ resource: string; id: string; section: string }>();
  const allowed = user?.role === 'STAFF' && isStaffWorkflow(resource) && Object.hasOwn(resources, resource);
  const path = resource === 'stock-movements' ? '/staff/stock-movements' : '/staff/management/' + resource;
  const data = useResource<Row>(allowed && id ? path + '/' + encodeURIComponent(id) : null);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[staffStyles.page, { paddingBottom: 24 }]}><Stack.Screen options={{ title: section || 'Chi tiết hồ sơ' }} />
    {!allowed ? <EmptyState title="Không có quyền truy cập" message="Mở lại hồ sơ trong khu vực Staff." /> : data.loading ? <LoadingState /> : data.error ? <ErrorState message={data.error} onRetry={data.refresh} /> : data.data ? <StaffRecordSections resource={resource} row={data.data} section={section} /> : null}
  </ScrollView>;
}
