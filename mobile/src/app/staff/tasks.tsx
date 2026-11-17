import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Search, SlidersHorizontal } from 'lucide-react-native';
import { useAuth } from '@/auth/use-auth';
import { useActivity } from '@/activity/context';
import { StaffLink, StaffTaskRow, staffStyles as s } from '@/components/staff-ui';
import { awaitingAssignment, staffNeedsAction, staffWorkGroups, staffWorkRank } from '@/utils/work-queue';
import { recordMatches } from '@/utils/record-search';
import { idOf, label, text, type Row } from '@/operations/model';
import { WdpColors as C } from '@/constants/wdp-theme';

const views = [['mine', 'Của tôi'], ['progress', 'Đang làm'], ['waiting', 'Chờ giao'], ['shared', 'Tiếp nhận']] as const;
type QueueView = typeof views[number][0];
type QueueItem = { key: string; resource: string; title: string; row: Row };
const assignedModules = new Set(['support-requests', 'maintenance', 'stock-movements']);

export default function StaffTasksScreen() {
  const { user } = useAuth();
  const activity = useActivity();
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<QueueView>(views.some(([key]) => key === params.view) ? params.view as QueueView : 'mine');
  const [query, setQuery] = useState('');
  const [workflow, setWorkflow] = useState('');
  const [status, setStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [section, setSection] = useState<'work' | 'lookup'>('work');
  const all: QueueItem[] = staffWorkGroups.flatMap(group => (activity.data[group.resource] ?? []).map(row => ({ key: group.resource + ':' + idOf(row), resource: group.resource, title: group.title, row })));
  const eligible = all.filter(({ resource, row }) => {
    if (view === 'waiting') return awaitingAssignment(resource, row);
    const actionable = staffNeedsAction(resource, row, user?.id ?? '');
    if (view === 'shared') return !assignedModules.has(resource) && actionable;
    return text(row, 'assignedStaff.id') === user?.id && actionable && (view !== 'progress' || ['IN_PROGRESS', 'INSPECTION_IN_PROGRESS'].includes(String(row.status)));
  });
  const statuses = [...new Set(eligible.filter(item => !workflow || item.resource === workflow).map(item => String(item.row.status)))];
  const items = eligible.filter(item => (!workflow || item.resource === workflow) && (!status || item.row.status === status) && recordMatches(item.row, query, item.title))
    .sort((a, b) => staffWorkRank(a.resource, a.row) - staffWorkRank(b.resource, b.row) || a.key.localeCompare(b.key));
  const chip = (key: string, title: string, selected: boolean, onPress: () => void) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ minHeight: 48, justifyContent: 'center', paddingVertical: 5 }}><View style={{ minHeight: 38, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: selected ? C.navy : C.surface }}><Text style={[s.secondary, { color: selected ? C.surface : C.navy, fontWeight: '600' }]}>{title}</Text></View></Pressable>;
  return <FlatList data={section === 'work' ? items : []} keyExtractor={item => item.key} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[s.page, { gap: 0, paddingBottom: 24 }]}
    refreshControl={<RefreshControl refreshing={activity.checking} onRefresh={activity.refresh} tintColor={C.navy} />}
    ListHeaderComponent={<View style={{ gap: 8, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: C.surfaceSecondary }}>{([['work', 'Công việc'], ['lookup', 'Tra cứu']] as const).map(([key, title]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: section === key }} onPress={() => setSection(key)} style={{ flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: section === key ? C.surface : 'transparent' }}><Text style={[s.body, { fontWeight: '600' }]}>{title}</Text></Pressable>)}</View>
      {section === 'lookup' ? <View style={s.surface}><StaffLink title="Kho tôi phụ trách" path="/staff/assigned-units" /><StaffLink title="Tra cứu kho đang thuê" path="/staff/rentals" /></View> : <>
        <View style={[s.surface, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }]}><Search size={20} color={C.muted} /><TextInput accessibilityLabel="Tìm công việc" placeholder="Tìm mã phiếu, kho, khách hàng…" placeholderTextColor={C.muted} value={query} onChangeText={setQuery} autoCorrect={false} style={[s.body, { flex: 1, minHeight: 48, paddingVertical: 12 }]} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{views.map(([key, title]) => chip(key, title, view === key, () => { setView(key); setStatus(''); }))}</ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text accessibilityRole="header" style={[s.section, { flex: 1 }]}>{view === 'mine' ? 'Việc được giao' : view === 'progress' ? 'Đang thực hiện' : view === 'waiting' ? 'Chờ phân công' : 'Yêu cầu tiếp nhận'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Bộ lọc công việc" accessibilityState={{ expanded: showFilters }} onPress={() => setShowFilters(value => !value)} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><SlidersHorizontal size={20} color={C.navy} /></Pressable></View>
        {showFilters && <><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{chip('all-workflows', 'Mọi nghiệp vụ', !workflow, () => { setWorkflow(''); setStatus(''); })}{staffWorkGroups.map(group => chip(group.resource, group.title, workflow === group.resource, () => { setWorkflow(group.resource); setStatus(''); }))}</ScrollView><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{chip('all-statuses', 'Mọi trạng thái', !status, () => setStatus(''))}{statuses.map(value => chip(value, label(value), status === value, () => setStatus(value)))}</ScrollView></>}
        {view === 'waiting' && <Text style={s.secondary}>Chỉ theo dõi, chờ quản lý phân công.</Text>}
        {activity.failed.length > 0 && <Text accessibilityRole="alert" style={[s.secondary, { color: C.danger }]}>Chưa tải đủ công việc. Kéo xuống để thử lại.</Text>}
      </>}
    </View>}
    ListEmptyComponent={section === 'work' ? <Text style={[s.secondary, { paddingVertical: 16 }]}>{activity.loading ? 'Đang tải công việc…' : activity.failed.length ? 'Chưa thể kiểm tra đầy đủ danh sách.' : 'Không có công việc phù hợp.'}</Text> : null}
    renderItem={({ item }) => <StaffTaskRow resource={item.resource} row={item.row} />}
  />;
}
