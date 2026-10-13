import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { RecordCard } from '@/components/record-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { useApiResource } from '@/hooks/use-api-resource';
import type { Paginated, StaffAppointment } from '@/types/api';
import { formatDate } from '@/utils/format';

export default function StaffAppointmentsScreen() {
  const resource = useApiResource<Paginated<StaffAppointment>>('/staff/appointments?limit=100');
  if (resource.loading) return <View style={styles.stateWrap}><LoadingState /></View>;
  if (resource.error) return <View style={styles.stateWrap}><ErrorState message={resource.error} onRetry={resource.refresh} /></View>;
  return <FlatList data={resource.data?.items ?? []} keyExtractor={(item) => item.id} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={resource.refresh} tintColor={WdpColors.orange} />} ListHeaderComponent={<PageHeader eyebrow="Vận hành" title="Lịch bàn giao" description="Đối chiếu khách hàng, reservation và unit trước khi bàn giao." />} ListHeaderComponentStyle={styles.header} ItemSeparatorComponent={() => <View style={styles.separator} />} ListEmptyComponent={<EmptyState title="Không có lịch bàn giao" message="Lịch sẽ xuất hiện khi Manager xác nhận yêu cầu của khách." />} renderItem={({ item }) => <RecordCard code={item.appointmentCode} title={`${item.customer.fullName} · ${item.reservation.reference}`} status={item.status} detail={`${formatDate(item.scheduledAt, true)} · ${item.allocatedUnits.map((unit) => unit.unitCode).join(', ') || 'Chưa phân unit'}`} />} />;
}

const styles = StyleSheet.create({ content: { flexGrow: 1, padding: WdpSpacing.md, paddingBottom: WdpSpacing.xl }, header: { paddingBottom: WdpSpacing.lg }, separator: { height: WdpSpacing.sm }, stateWrap: { flex: 1, justifyContent: 'center', backgroundColor: WdpColors.background, padding: WdpSpacing.md } });
