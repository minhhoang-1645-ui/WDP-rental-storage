import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useActivity } from '@/activity/context';
import { staffPriorityActivities } from '@/utils/activity';
import { awaitingAssignment } from '@/utils/work-queue';
import { StaffShortcuts, StaffLink, StaffTaskRow, staffStyles as s } from '@/components/staff-ui';
import { WdpColors as C } from '@/constants/wdp-theme';

export default function StaffHomeScreen() {
  const activity = useActivity();
  const queue = staffPriorityActivities(activity.entries).flatMap(item => {
    const row = activity.data[item.kind]?.find(row => item.id === item.kind + ':' + String(row.id));
    return row && !awaitingAssignment(item.kind, row) ? [{ item, row }] : [];
  }).slice(0, 3);
  return <FlatList data={queue} keyExtractor={({ item }) => item.id}
    contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[s.page, { gap: 8, paddingTop: 12, paddingBottom: 24 }]}
    refreshControl={<RefreshControl refreshing={activity.checking} onRefresh={activity.refresh} tintColor={C.navy} />}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={s.title}>Hôm nay</Text>
      <StaffShortcuts />
      <Text accessibilityRole="header" style={[s.section, { marginTop: 4 }]}>Việc ưu tiên</Text>
      {activity.failed.length > 0 && <Text accessibilityRole="alert" style={s.secondary}>Chưa cập nhật đủ công việc. Kéo xuống để thử lại.</Text>}
    </View>}
    renderItem={({ item: { item, row } }) => <StaffTaskRow resource={item.kind} row={row} path={item.mobile} />}
    ListEmptyComponent={<Text style={[s.secondary, { paddingVertical: 12 }]}>{activity.loading ? 'Đang tải công việc…' : activity.failed.length ? 'Chưa thể kiểm tra việc ưu tiên.' : 'Chưa có việc cần xử lý.'}</Text>}
    ListFooterComponent={<StaffLink title="Mở danh sách công việc" path="/staff/tasks" />}
  />;
}
