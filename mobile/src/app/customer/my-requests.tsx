import { useState } from 'react';
import { ScrollView, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { ChevronRight, ClipboardList } from 'lucide-react-native';
import { useResource } from '@/operations/use-resource';
import { idOf, rows, text, type Row } from '@/operations/model';
import { isTransferRequest } from '@/utils/transfer-request';
import { isEarlyReturnRequest } from '@/utils/early-return';
import { formatDate } from '@/utils/format';
import { StatusBadge } from '@/components/customer-ui';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { CustomerTheme as C } from '@/constants/wdp-theme';

const kinds = ['Gia hạn', 'Chuyển kho', 'Trả kho', 'Hỗ trợ'] as const;
type Kind = typeof kinds[number];

function entry(row: Row, kind: Kind, resource: string) {
  return { row, kind, resource, id: idOf(row), status: text(row, 'status') };
}

export default function MyRequestsScreen() {
  const renewals = useResource<Row>('/customer/renewals', true);
  const returns = useResource<Row>('/customer/returns', true);
  const support = useResource<Row>('/customer/support-requests', true);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const sources = [renewals, returns, support];
  const loading = sources.some(source => source.loading);
  const issue = sources.find(source => source.error);
  const refresh = () => { setRefreshing(true); sources.forEach(source => source.refresh()); };
  const entries = [
    ...rows(renewals.data?.items).map(row => entry(row, 'Gia hạn', 'renewals')),
    ...rows(returns.data?.items).map(row => entry(row, 'Trả kho', 'returns')),
    ...rows(support.data?.items).map(row => isEarlyReturnRequest(row) ? entry(row, 'Trả kho', 'early-returns')
      : isTransferRequest(row) ? entry(row, 'Chuyển kho', 'transfers') : entry(row, 'Hỗ trợ', 'support-requests')),
  ].filter(item => item.id).sort((a, b) => text(b.row, 'createdAt').localeCompare(text(a.row, 'createdAt')));
  const typed = entries.filter(item => !kind || item.kind === kind);
  const statuses = [...new Set(typed.map(item => item.status).filter(Boolean))];
  const visible = typed.filter(item => !status || item.status === status);

  return <ScrollView style={s.screen} contentContainerStyle={s.page}
    refreshControl={<RefreshControl refreshing={refreshing && loading} onRefresh={refresh} />}>
    <Stack.Screen options={{ title: 'Yêu cầu của tôi', headerTitleAlign: 'center', headerTitleStyle: { color: C.cobalt, fontSize: 19, fontWeight: '800' } }} />
    <View accessibilityLabel="Loại yêu cầu" style={s.filters}>
      {['', ...kinds].map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: kind === value }}
        onPress={() => { setKind(value); setStatus(''); }} style={[s.chip, kind === value && s.selected]}>
        <Text style={[s.chipText, kind === value && s.onSelected]}>{value || 'Tất cả'}</Text>
      </Pressable>)}
    </View>
    {statuses.length > 0 && <View accessibilityLabel="Trạng thái yêu cầu" style={s.filters}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: !status }} onPress={() => setStatus('')}
        style={[s.chip, !status && s.selected]}><Text style={[s.chipText, !status && s.onSelected]}>Mọi trạng thái</Text></Pressable>
      {statuses.map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: status === value }}
        onPress={() => setStatus(value)} style={[s.chip, status === value && s.selected]}><StatusBadge status={value} /></Pressable>)}
    </View>}
    {loading ? <LoadingState layout="list" /> : issue ? <ErrorState message={issue.error ?? ''} onRetry={refresh} />
      : !visible.length ? <EmptyState title={entries.length ? 'Không tìm thấy yêu cầu phù hợp' : 'Bạn chưa có yêu cầu'} message={entries.length ? 'Thử đổi bộ lọc.' : 'Yêu cầu đã gửi sẽ xuất hiện tại đây.'} />
        : visible.map(item => {
          const code = text(item.row, 'renewalCode', 'returnCode', 'supportCode');
          const context = text(item.row, 'contract.contractCode', 'rentalContract.contractCode', 'unit.unitCode', 'reservation.reference');
          const date = text(item.row, 'createdAt');
          return <Pressable key={item.resource + ':' + item.id} accessibilityRole="button" style={s.card}
            onPress={() => router.push(('/customer/' + item.resource + '/' + encodeURIComponent(item.id)) as Href)}>
            <View style={s.icon}><ClipboardList size={21} color={C.cobalt} /></View>
            <View style={s.copy}>
              <Text style={s.title}>{item.kind}{code ? ' · ' + code : ''}</Text>
              {[context, date && formatDate(date)].filter(Boolean).length > 0 && <Text style={s.muted}>{[context, date && formatDate(date)].filter(Boolean).join(' · ')}</Text>}
              {item.status ? <StatusBadge status={item.status} /> : null}
            </View>
            <ChevronRight size={18} color={C.muted} />
          </Pressable>;
        })}
  </ScrollView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' },
  page: { padding: 15, gap: 10 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  chip: { minHeight: 42, paddingHorizontal: 9, borderRadius: 15, borderWidth: 1, borderColor: '#DFE6F0', justifyContent: 'center' },
  selected: { borderColor: C.cobalt, backgroundColor: C.cobalt },
  onSelected: { color: 'white' },
  chipText: { color: C.text, fontWeight: '700', fontSize: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderWidth: 1, borderColor: '#DFE6F0', borderRadius: 13 },
  icon: { padding: 8, borderRadius: 10, backgroundColor: '#EDF3FE' },
  copy: { flex: 1, gap: 4, alignItems: 'flex-start' },
  title: { color: C.text, fontWeight: '800', fontSize: 14 },
  muted: { color: C.muted, fontSize: 12 },
});
