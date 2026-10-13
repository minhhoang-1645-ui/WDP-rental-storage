import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { RecordCard } from '@/components/record-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { useApiResource } from '@/hooks/use-api-resource';
import type { CustomerRental, Paginated } from '@/types/api';
import { formatDate, formatMoney } from '@/utils/format';

export default function CustomerRentalsScreen() {
  const resource = useApiResource<Paginated<CustomerRental>>('/customer/rentals?limit=100');
  if (resource.loading) return <View style={styles.stateWrap}><LoadingState /></View>;
  if (resource.error) return <View style={styles.stateWrap}><ErrorState message={resource.error} onRetry={resource.refresh} /></View>;
  return <FlatList data={resource.data?.items ?? []} keyExtractor={(item) => item.reservationId} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={resource.refresh} tintColor={WdpColors.orange} />} ListHeaderComponent={<PageHeader eyebrow="Kho của tôi" title="Kho đang thuê" description="Theo dõi vị trí unit, thời hạn và công nợ của từng reservation." />} ListHeaderComponentStyle={styles.header} ItemSeparatorComponent={() => <View style={styles.separator} />} ListEmptyComponent={<EmptyState title="Chưa có kho đang thuê" message="Kho sẽ xuất hiện sau khi hợp đồng được kích hoạt và bàn giao." />} renderItem={({ item }) => <RecordCard code={item.reservationReference} title={`${item.storageType.name} · ${item.unitCount} unit`} status={item.rentalState} detail={`Hết hạn: ${formatDate(item.effectiveEndDate)} · Còn phải trả: ${formatMoney(item.billingSummary.totalOutstanding)}`} />} />;
}

const styles = StyleSheet.create({ content: { flexGrow: 1, padding: WdpSpacing.md, paddingBottom: WdpSpacing.xl }, header: { paddingBottom: WdpSpacing.lg }, separator: { height: WdpSpacing.sm }, stateWrap: { flex: 1, justifyContent: 'center', backgroundColor: WdpColors.background, padding: WdpSpacing.md } });
