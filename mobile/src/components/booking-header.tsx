import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';

export const bookingBlue = '#0758DC';
export const bookingNavy = '#14243B';
const titles = ['Chọn cơ sở', 'Chọn loại kho', 'Thời gian thuê', 'Chọn vị trí kho', 'Thiết bị thêm', 'Chi phí & xác nhận'];

export function BookingHeader({ step, onBack, busy, title }: {
  step: number; onBack: () => void; busy?: boolean; title?: string;
}) {
  return <View style={s.header}>
    <View style={s.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={title ? 'Về danh sách cơ sở' : 'Quay lại'}
        disabled={busy} onPress={onBack} style={s.back}><ChevronLeft size={23} color={bookingNavy} /></Pressable>
      <Text accessibilityRole="header" style={s.title}>{title ?? titles[step - 1]}</Text>
      <Text style={s.count}>{step}/{titles.length}</Text>
    </View>
    <View style={s.progress} accessibilityLabel={'Bước ' + step + ' trên ' + titles.length}>
      {titles.map((label, index) => <View key={label} style={[s.segment, index < step && s.complete]} />)}
    </View>
  </View>;
}

export function BookingTabs({ options, value, onChange }: {
  options: { value: string; label: string }[]; value: string; onChange: (value: string) => void;
}) {
  return <View style={s.tabs}>{options.map(option => {
    const active = option.value === value;
    return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: active }}
      style={[s.tab, active && s.complete]} onPress={() => onChange(option.value)}>
      <Text style={[s.tabText, active && s.tabActive]}>{option.label}</Text>
    </Pressable>;
  })}</View>;
}

const s = StyleSheet.create({
  header: { backgroundColor: 'white', paddingHorizontal: 15, paddingBottom: 10, gap: 5 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 45 },
  back: { width: 44, minHeight: 44, justifyContent: 'center' },
  title: { flex: 1, color: bookingNavy, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  count: { width: 44, textAlign: 'right', color: bookingNavy, fontSize: 14, fontWeight: '600' },
  progress: { flexDirection: 'row', gap: 5 },
  segment: { flex: 1, height: 5, borderRadius: 4, backgroundColor: '#D5DCE6' },
  complete: { backgroundColor: bookingBlue },
  tabs: { flexDirection: 'row', borderRadius: 24, backgroundColor: '#EFF2F7', padding: 2 },
  tab: { flex: 1, borderRadius: 22, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  tabText: { color: bookingNavy, fontSize: 14, textAlign: 'center', fontWeight: '700' },
  tabActive: { color: 'white' },
});
