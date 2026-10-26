import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { Button, Panel, styles } from '@/operations/ui';
import { WdpColors } from '@/constants/wdp-theme';
import { hasDraft, refreshScreens } from '@/services/live-events';
import { formatDate } from '@/utils/format';
import type { ActivityEntry } from '@/utils/activity';
import { useActivity } from './context';

export function ActivityBell() {
  const activity = useActivity(), [open, setOpen] = useState(false);
  const unread = activity.entries.filter(item => !activity.read.includes(item.token)).length;
  return <><Pressable accessibilityRole="button" accessibilityLabel={`Thông báo, ${unread} chưa đọc`} onPress={() => setOpen(true)} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 12 }}><Text style={{ color: WdpColors.navy, fontWeight: '700', fontSize: 13 }}>Thông báo{unread ? ` (${unread > 99 ? '99+' : unread})` : ''}</Text></Pressable><Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>{open && <ActivityPanel onClose={() => setOpen(false)} />}</Modal></>;
}
function ActivityPanel({ onClose }: { onClose: () => void }) {
  const activity = useActivity(), [view, setView] = useState<'unread' | 'action' | 'all'>('unread');
  const entries = activity.entries.filter(item => view === 'all' || (view === 'action' ? item.action : !activity.read.includes(item.token)));
  return <SafeAreaView style={{ flex: 1, backgroundColor: WdpColors.background }}><FlatList data={entries} keyExtractor={item => item.id} contentContainerStyle={styles.page} ListHeaderComponent={<View style={{ gap: 12 }}><Text accessibilityRole="header" style={styles.title}>Thông báo & việc cần làm</Text><Button title="Đóng thông báo" variant="secondary" onPress={onClose} /><Text style={styles.copy}>Cập nhật trạng thái khi ứng dụng đang mở. Chọn một hồ sơ để xem chi tiết hoặc thực hiện bước tiếp theo.</Text><Button title={activity.checking ? 'Đang kiểm tra…' : 'Kiểm tra mới'} onPress={activity.refresh} disabled={activity.checking} /><Button title="Đánh dấu đã đọc" variant="secondary" onPress={() => activity.markRead(activity.entries.map(item => item.token))} /><View style={styles.row}>{([['unread', 'Chưa đọc'], ['action', 'Cần thực hiện'], ['all', 'Tất cả']] as const).map(([key, title]) => <Button key={key} title={`${view === key ? '✓ ' : ''}${title} (${activity.entries.filter(item => key === 'all' || (key === 'action' ? item.action : !activity.read.includes(item.token))).length})`} variant={view === key ? 'primary' : 'secondary'} onPress={() => setView(key)} />)}</View><ActivityStatus /></View>} renderItem={({item}) => <ActivityItem item={item} onOpen={onClose} />} ListEmptyComponent={<Text style={styles.copy}>{activity.loading ? 'Đang tải hồ sơ…' : view === 'unread' ? 'Bạn đã xem hết thông báo hiện có. Các việc chưa xong vẫn nằm trong Cần thực hiện.' : 'Chưa có hồ sơ phù hợp.'}</Text>} ListFooterComponent={<Text style={styles.copy}>Đã đọc chỉ ghi nhận việc bạn đã xem trên thiết bị này, không thay đổi trạng thái yêu cầu.</Text>} /></SafeAreaView>;
}
function ActivityItem({ item, onOpen }: { item: ActivityEntry; onOpen?: () => void }) {
  const activity = useActivity(), unread = !activity.read.includes(item.token);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.code}${unread ? ', chưa đọc' : ''}`} onPress={() => { activity.markRead([item.token]); onOpen?.(); router.push(item.mobile as Href); }} style={({pressed}) => [styles.card, { marginVertical: 5, borderLeftWidth: unread ? 3 : 1, borderLeftColor: unread ? '#397887' : WdpColors.border }, pressed && styles.pressed]}><Text style={styles.label}>{item.code}{item.action ? ' · Cần thực hiện' : ''}{unread ? ' · Chưa đọc' : ''}</Text><Text style={styles.navigationTitle}>{item.title}</Text><Text style={styles.copy}>{item.message}</Text>{Boolean(item.at) && <Text style={styles.label}>{formatDate(item.at, true)}</Text>}</Pressable>;
}
function ActivityStatus() {
  const activity = useActivity();
  return <View><Text style={styles.copy}>{activity.checkedAt ? `Lần kiểm tra: ${formatDate(new Date(activity.checkedAt).toISOString(), true)}` : 'Đang kết nối'} · Tự kiểm tra mỗi 30 giây</Text>{activity.failed.length > 0 && <Text accessibilityRole="alert" style={styles.error}>Chưa tải được: {activity.failed.join(', ')}. Thông tin cũ được giữ lại; hãy kiểm tra mới khi có kết nối.</Text>}</View>;
}
export function ActivitySummary() {
  const [expanded, setExpanded] = useState(false);
  const activity = useActivity(), todo = activity.entries.filter(item => item.action), unread = activity.entries.filter(item => !activity.read.includes(item.token));
  const urgent = todo.slice(0, 1), updates = [...unread].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0)).filter(item => !urgent.some(entry => entry.id === item.id));
  const shown = [...urgent, ...updates, ...todo].filter((item, index, items) => items.findIndex(entry => entry.id === item.id) === index).slice(0, expanded ? 8 : 1);
  return <Panel title="Cần thực hiện & cập nhật mới"><Text style={styles.copy}>{activity.loading ? 'Đang tải công việc và thông báo…' : `${todo.length} hồ sơ cần thực hiện · ${unread.length} cập nhật chưa đọc`}</Text><ActivityBell /><ActivityStatus />{shown.map(item => <ActivityItem key={item.id} item={item} />)}{!activity.loading && !todo.length && !unread.length && <Text style={styles.copy}>Chưa có việc cần thực hiện hoặc cập nhật chưa đọc trong dữ liệu đã tải.</Text>}{new Set([...todo, ...unread].map(item => item.id)).size > 1 && <Button title={expanded ? 'Thu gọn' : 'Xem thêm việc & cập nhật'} variant="secondary" onPress={() => setExpanded(value => !value)} />}</Panel>;
}
export function ActivityRefreshNote() {
  const activity = useActivity(), [message, setMessage] = useState('');
  if (!activity.changed) return null;
  return <View style={[styles.card, { margin: 12, padding: 12 }]}><Text accessibilityRole="alert" style={styles.copy}>{message || 'Có cập nhật mới. Mở Thông báo để xem thay đổi; màn hình không có form đang nhập được làm mới tự động.'}</Text><View style={styles.row}><Button title="Cập nhật màn hình" variant="secondary" onPress={() => { if (hasDraft()) { setMessage('Hãy lưu hoặc đóng form đang nhập trước khi cập nhật màn hình.'); return; } refreshScreens(); activity.acknowledge(); setMessage(''); }} /><Button title="Ẩn nhắc cập nhật" variant="secondary" onPress={activity.acknowledge} /></View></View>;
}
