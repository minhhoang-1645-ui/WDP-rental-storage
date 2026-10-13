import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { RecordCard } from '@/components/record-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { useApiResource } from '@/hooks/use-api-resource';
import type { CustomerInvoice, Paginated } from '@/types/api';
import { formatDate, formatMoney } from '@/utils/format';

export default function CustomerPaymentsScreen() {
  const resource = useApiResource<Paginated<CustomerInvoice>>('/customer/invoices?limit=100');
  if (resource.loading) return <View style={styles.stateWrap}><LoadingState /></View>;
  if (resource.error) return <View style={styles.stateWrap}><ErrorState message={resource.error} onRetry={resource.refresh} /></View>;
  return <FlatList data={resource.data?.items ?? []} keyExtractor={(item) => item.id} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={resource.refresh} tintColor={WdpColors.orange} />} ListHeaderComponent={<PageHeader eyebrow="Thanh toán" title="Hóa đơn" description="Số dư và trạng thái được lấy trực tiếp từ hệ thống Billing." />} ListHeaderComponentStyle={styles.header} ItemSeparatorComponent={() => <View style={styles.separator} />} ListEmptyComponent={<EmptyState title="Chưa có hóa đơn" message="Hóa đơn sẽ xuất hiện sau khi reservation được xác nhận." />} renderItem={({ item }) => <RecordCard code={item.invoiceCode} title={`${item.reservation.reference} · ${formatMoney(item.balanceDue, item.currency)} còn lại`} status={item.status} detail={`Tổng tiền: ${formatMoney(item.totalAmount, item.currency)} · Hạn trả: ${formatDate(item.dueAt)}`} />} />;
}

const styles = StyleSheet.create({ content: { flexGrow: 1, padding: WdpSpacing.md, paddingBottom: WdpSpacing.xl }, header: { paddingBottom: WdpSpacing.lg }, separator: { height: WdpSpacing.sm }, stateWrap: { flex: 1, justifyContent: 'center', backgroundColor: WdpColors.background, padding: WdpSpacing.md } });
