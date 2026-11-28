import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CustomerTheme as C } from '@/constants/wdp-theme';
import { customerStyles as s } from '@/components/customer-premium';
import { useResource } from '@/operations/use-resource';
import { apiRequest } from '@/services/api';
import { ErrorState, LoadingState } from '@/components/screen-state';

type Unit = { id: string; code: string; facility: { name: string }; type: string };
type Relocation = { id: string; code: string; status: string; contract: { id: string; code: string }; source: Unit; destination: Unit; consent: boolean; sourceHandover: boolean; destinationHandover: boolean };
const statuses: Record<string, string> = { REQUESTED: 'Chờ xác nhận phương án', APPROVED: 'Đã giữ kho mới', COMPLETED: 'Đã hoàn tất chuyển kho', REJECTED: 'Phương án đã kết thúc' };

export function CustomerRelocations({ contractId, onRefresh }: { contractId?: string; onRefresh: () => void }) {
  const resource = useResource<Relocation[]>('/relocations', false, true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<{ id: string; agreed: boolean }>();
  const items = resource.data?.filter(row => !contractId || row.contract.id === contractId) ?? [];
  async function submit(row: Relocation, agreed: boolean) {
    if (busy) return;
    setBusy(row.id); setError('');
    try {
      await apiRequest('/relocations/' + encodeURIComponent(row.id) + '/consent', { method: 'POST', body: JSON.stringify({ agreed, destinationId: row.destination.id }) });
      setChoice(undefined); resource.refresh(); onRefresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Chưa thể ghi nhận xác nhận.'); }
    finally { setBusy(''); }
  }
  if (resource.loading && !resource.data) return <LoadingState layout="detail" />;
  if (resource.error) return <ErrorState message={resource.error} onRetry={resource.refresh} />;
  if (!items.length) return null;
  return <View style={{ gap: 10 }}>
    <Text style={s.section}>Hỗ trợ di dời kho</Text>
    {items.map(row => <View key={row.id} style={{ padding: 13, gap: 8, borderRadius: 14, borderCurve: 'continuous', backgroundColor: C.soft }}>
      <Text style={s.section}>{statuses[row.status] ?? row.status}</Text>
      <Text selectable style={s.secondary}>{row.contract.code}</Text>
      <Text selectable style={s.body}>Kho cũ · {row.source.facility.name} · {row.source.code}</Text>
      <Text selectable style={s.body}>Kho mới · {row.destination.facility.name} · {row.destination.code}</Text>
      {row.status === 'REQUESTED' && <Text style={s.secondary}>Giữ nguyên giá thuê, tiền cọc và thời hạn hợp đồng.</Text>}
      {row.status === 'APPROVED' && <Text style={s.secondary}>{row.sourceHandover ? 'Đã bàn giao kho cũ. Chờ tiếp nhận kho mới.' : 'Nhân viên sẽ liên hệ để hỗ trợ bàn giao.'}</Text>}
      {row.status === 'REQUESTED' && choice?.id !== row.id && <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable disabled={!!busy} accessibilityRole="button" onPress={() => setChoice({ id: row.id, agreed: true })} style={{ flex: 1, borderRadius: 10, minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: C.cobalt }}><Text style={{ color: 'white', fontWeight: '700' }}>Đồng ý</Text></Pressable>
        <Pressable disabled={!!busy} accessibilityRole="button" onPress={() => setChoice({ id: row.id, agreed: false })} style={{ flex: 1, borderRadius: 10, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.divider }}><Text style={s.link}>Từ chối</Text></Pressable>
      </View>}
      {row.status === 'REQUESTED' && choice?.id === row.id && <>
        <Text style={s.body}>{choice.agreed ? 'Bạn đồng ý chuyển đến kho mới này?' : 'Bạn từ chối phương án kho mới này?'}</Text>
        <Pressable disabled={!!busy} accessibilityRole="button" onPress={() => void submit(row, choice.agreed)} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: C.cobalt, borderRadius: 10 }}><Text style={{ color: 'white', fontWeight: '700' }}>{busy ? 'Đang gửi…' : 'Xác nhận'}</Text></Pressable>
        <Pressable disabled={!!busy} accessibilityRole="button" onPress={() => setChoice(undefined)} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={s.link}>Quay lại</Text></Pressable>
      </>}
    </View>)}
    {error && <Text selectable accessibilityRole="alert" style={{ color: '#B42318' }}>{error}</Text>}
  </View>;
}
