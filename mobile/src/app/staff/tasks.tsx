import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Navigation } from '@/operations/ui';
import { label } from '@/operations/model';

import { PageHeader } from '@/components/page-header';
import { RecordCard } from '@/components/record-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { useApiResource } from '@/hooks/use-api-resource';
import type { Paginated, StaffTask } from '@/types/api';

type TaskKind = 'Bảo trì' | 'Hỗ trợ' | 'Trả kho' | 'Chuyển kho';
type DisplayTask = StaffTask & { kind: TaskKind; key: string };
const taskPaths: Record<TaskKind, string> = { 'Bảo trì': 'maintenance', 'Hỗ trợ': 'support-requests', 'Trả kho': 'returns', 'Chuyển kho': 'transfers' };

export default function StaffTasksScreen() {
  const maintenance = useApiResource<Paginated<StaffTask>>('/staff/maintenance?limit=100');
  const support = useApiResource<Paginated<StaffTask>>('/staff/support-requests?limit=100');
  const returns = useApiResource<Paginated<StaffTask>>('/staff/returns?limit=100');
  const transfers = useApiResource<Paginated<StaffTask>>('/staff/transfers?limit=100');
  const resources = [maintenance, support, returns, transfers];
  const loading = resources.some((item) => item.loading);
  const error = resources.find((item) => item.error)?.error;
  const refresh = () => resources.forEach((item) => item.refresh());
  const withKind = (items: StaffTask[] | undefined, kind: TaskKind): DisplayTask[] => (items ?? []).map((item) => ({ ...item, kind, key: `${kind}-${item.id}` }));
  const items = [
    ...withKind(maintenance.data?.items, 'Bảo trì'),
    ...withKind(support.data?.items, 'Hỗ trợ'),
    ...withKind(returns.data?.items, 'Trả kho'),
    ...withKind(transfers.data?.items, 'Chuyển kho'),
  ];
  if (loading) return <View style={styles.stateWrap}><LoadingState /></View>;
  if (error) return <View style={styles.stateWrap}><ErrorState message={error} onRetry={refresh} /><Navigation title="Về tổng quan" path="/staff" />{Object.entries(taskPaths).map(([title, resource]) => <Navigation key={resource} title={title} path={`/staff/${resource}`} />)}</View>;
  return <FlatList data={items} keyExtractor={(item) => item.key} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={WdpColors.orange} />} ListHeaderComponent={<View style={{ gap: 12 }}><PageHeader eyebrow="Công việc" title="Vận hành tại cơ sở" description="Tổng hợp bảo trì, hỗ trợ, trả kho và chuyển kho dành cho nhân viên." />{Object.entries(taskPaths).map(([title, resource]) => <Navigation key={resource} title={title} path={`/staff/${resource}`} />)}</View>} ListHeaderComponentStyle={styles.header} ItemSeparatorComponent={() => <View style={styles.separator} />} ListEmptyComponent={<EmptyState title="Không có công việc" message="Các việc được giao hoặc đã duyệt sẽ xuất hiện tại đây." />} renderItem={({ item }) => <RecordCard onPress={() => router.push(`/staff/${taskPaths[item.kind]}/${encodeURIComponent(item.id)}` as Href)} code={item.maintenanceCode || item.supportCode || item.returnCode || item.transferCode || item.id} title={`${item.kind}${item.priority ? ` · ${label(item.priority)}` : ''}`} status={item.status} detail={item.description || item.subject || [item.fromUnit?.unitCode, item.toUnit?.unitCode].filter(Boolean).join(' → ') || item.unit?.unitCode || 'Xem trên hệ thống WDP'} />} />;
}

const styles = StyleSheet.create({ content: { flexGrow: 1, padding: WdpSpacing.md, paddingBottom: WdpSpacing.xl }, header: { paddingBottom: WdpSpacing.lg }, separator: { height: WdpSpacing.sm }, stateWrap: { flex: 1, justifyContent: 'center', backgroundColor: WdpColors.background, padding: WdpSpacing.md } });
