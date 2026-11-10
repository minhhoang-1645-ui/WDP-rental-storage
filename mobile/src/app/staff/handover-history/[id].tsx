import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { RecordView } from '@/operations/record-view';
import { useResource } from '@/operations/use-resource';
import { styles } from '@/operations/ui';
import type { Row } from '@/operations/model';

export default function HandoverHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useResource<Row>(`/staff/management/appointments/${encodeURIComponent(id)}`);
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
      {data.loading ? <LoadingState layout="detail" /> : data.error ? (
        <ErrorState message={data.error} onRetry={data.refresh} />
      ) : data.data ? (
        <RecordView row={data.data} root="/staff" />
      ) : <EmptyState title="Không tìm thấy hồ sơ" message="Quay lại lịch bàn giao để kiểm tra." />}
    </ScrollView>
  );
}
