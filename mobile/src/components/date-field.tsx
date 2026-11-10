import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';
import { Calendar } from 'lucide-react-native';
import { calendarChoice, daysInMonth, isCalendarDate, vietnamCalendarDate } from '@/utils/calendar-date';

/**
 * Cross-platform date input.
 * Web accepts ISO text; native offers scrollable calendar columns.
 */
export function DateField({ title, value, onChange, min }: { title: string; value: string; onChange: (value: string) => void; min?: string }) {
  const minimum = min && isCalendarDate(min) ? min : '';
  const initialDate = isCalendarDate(value) && (!minimum || value >= minimum) ? value : minimum || vietnamCalendarDate();
  const [modal, setModal] = useState(false);
  const [tempYear, setTempYear] = useState(() => initialDate.slice(0, 4));
  const [tempMonth, setTempMonth] = useState(() => initialDate.slice(5, 7));
  const [tempDay, setTempDay] = useState(() => initialDate.slice(8, 10));
  const { height } = useWindowDimensions();
  const currentIssue = value && (!isCalendarDate(value) ? 'Ngày không hợp lệ. Nhập theo YYYY-MM-DD.' : minimum && value < minimum ? `Chọn ngày từ ${minimum} trở đi.` : '');

  const openPicker = () => {
    const initial = isCalendarDate(value) && (!minimum || value >= minimum) ? value : minimum || vietnamCalendarDate();
    setTempYear(initial.slice(0, 4));
    setTempMonth(initial.slice(5, 7));
    setTempDay(initial.slice(8, 10));
    setModal(true);
  };

  const confirm = () => {
    const result = calendarChoice(tempYear, tempMonth, tempDay);
    if (!isCalendarDate(result) || minimum && result < minimum) return;
    onChange(result);
    setModal(false);
  };

  if (Platform.OS === 'web') {
    return <View style={local.field}>
      <Text style={local.label}>{title}</Text>
      <TextInput accessibilityLabel={title} value={value} onChangeText={onChange} maxLength={10} placeholder="YYYY-MM-DD" placeholderTextColor={WdpColors.muted} style={local.input} />
      {currentIssue ? <Text accessibilityRole="alert" style={local.error}>{currentIssue}</Text> : null}
    </View>;
  }

  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const days = Array.from({ length: daysInMonth(tempYear, tempMonth) }, (_, i) => String(i + 1).padStart(2, '0'));
  const selectedYear = Number(tempYear) || new Date().getFullYear();
  // Keep the list bounded while allowing the window to move with the selected year.
  const firstYear = Math.max(minimum ? Number(minimum.slice(0, 4)) : 1, selectedYear - 10);
  const lastYear = Math.min(9999, Math.max(selectedYear + 10, firstYear));
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => String(firstYear + i));
  const candidate = calendarChoice(tempYear, tempMonth, tempDay);
  const unavailable = Boolean(minimum && candidate < minimum);
  const chooseMonth = (month: string) => { setTempMonth(month); setTempDay(calendarChoice(tempYear, month, tempDay).slice(8, 10)); };
  const chooseYear = (year: string) => { setTempYear(year); setTempDay(calendarChoice(year, tempMonth, tempDay).slice(8, 10)); };

  return <View style={local.field}>
    <Text style={local.label}>{title}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${value || 'chưa chọn'}`} onPress={openPicker} style={local.touchInput}>
      <Text style={value ? local.inputText : local.placeholder}>{value || 'Chọn ngày'}</Text>
      <Calendar size={18} color={WdpColors.muted} strokeWidth={1.8} />
    </Pressable>
    {currentIssue ? <Text accessibilityRole="alert" style={local.error}>{currentIssue}</Text> : null}
    <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
      <Pressable style={local.overlay} onPress={() => setModal(false)}>
        <Pressable style={local.sheet} onPress={e => e.stopPropagation()}>
          <Text style={local.sheetTitle}>Chọn ngày</Text>
          <View style={[local.pickerRow, { height: Math.max(120, Math.min(260, height * .32)) }]}>
            <View style={local.pickerCol}>
              <Text style={local.pickerLabel}>Năm</Text>
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentOffset={{ x: 0, y: Math.max(0, years.indexOf(tempYear) - 2) * 44 }}>{years.map(y => <Pressable accessibilityRole="button" accessibilityLabel={`Năm ${y}`} accessibilityState={{ selected: tempYear === y }} key={y} onPress={() => chooseYear(y)} style={[local.option, tempYear === y && local.optionActive]}><Text style={[local.optionText, tempYear === y && local.optionTextActive]}>{y}</Text></Pressable>)}</ScrollView>
            </View>
            <View style={local.pickerCol}>
              <Text style={local.pickerLabel}>Tháng</Text>
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentOffset={{ x: 0, y: Math.max(0, months.indexOf(tempMonth) - 2) * 44 }}>{months.map(m => <Pressable accessibilityRole="button" accessibilityLabel={`Tháng ${m}`} accessibilityState={{ selected: tempMonth === m }} key={m} onPress={() => chooseMonth(m)} style={[local.option, tempMonth === m && local.optionActive]}><Text style={[local.optionText, tempMonth === m && local.optionTextActive]}>{m}</Text></Pressable>)}</ScrollView>
            </View>
            <View style={local.pickerCol}>
              <Text style={local.pickerLabel}>Ngày</Text>
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentOffset={{ x: 0, y: Math.max(0, days.indexOf(tempDay) - 2) * 44 }}>{days.map(d => <Pressable accessibilityRole="button" accessibilityLabel={`Ngày ${d}`} accessibilityState={{ selected: tempDay === d }} key={d} onPress={() => setTempDay(d)} style={[local.option, tempDay === d && local.optionActive]}><Text style={[local.optionText, tempDay === d && local.optionTextActive]}>{d}</Text></Pressable>)}</ScrollView>
            </View>
          </View>
          <Text style={local.preview}>{candidate}</Text>
          {unavailable && <Text accessibilityRole="alert" style={local.error}>Chọn ngày từ {minimum} trở đi.</Text>}
          <View style={local.sheetActions}>
            <Pressable onPress={() => setModal(false)} style={local.cancelBtn}><Text style={local.cancelText}>Hủy</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={unavailable} accessibilityState={{ disabled: unavailable }} onPress={confirm} style={[local.confirmBtn, unavailable && { opacity: .5 }]}><Text style={local.confirmText}>Chọn ngày này</Text></Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

const local = StyleSheet.create({
  field: { gap: WdpSpacing.xs },
  label: { color: WdpColors.text, fontSize: 12, fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderColor: WdpColors.border, borderRadius: WdpRadius.sm, paddingHorizontal: WdpSpacing.sm, paddingVertical: WdpSpacing.sm, color: WdpColors.text, backgroundColor: WdpColors.surface, fontSize: 15 },
  touchInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderWidth: 1, borderColor: WdpColors.border, borderRadius: WdpRadius.sm, paddingHorizontal: WdpSpacing.sm, backgroundColor: WdpColors.surface },
  inputText: { color: WdpColors.text, fontSize: 15 },
  placeholder: { color: WdpColors.muted, fontSize: 15 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: WdpColors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: WdpSpacing.lg, gap: WdpSpacing.md, maxHeight: '80%' },
  sheetTitle: { color: WdpColors.navy, fontSize: 18, fontWeight: '700' },
  pickerRow: { flexDirection: 'row', gap: WdpSpacing.sm },
  pickerCol: { flex: 1, gap: 4 },
  pickerLabel: { color: WdpColors.muted, fontSize: 11, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  option: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingVertical: 6, borderRadius: WdpRadius.sm },
  error: { color: WdpColors.danger, fontSize: 12, lineHeight: 18 },
  optionActive: { backgroundColor: WdpColors.teal },
  optionText: { color: WdpColors.text, fontSize: 14, fontWeight: '500' },
  optionTextActive: { color: '#fff', fontWeight: '700' },
  preview: { color: WdpColors.navy, fontSize: 20, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  sheetActions: { flexDirection: 'row', gap: WdpSpacing.sm },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: WdpRadius.sm, borderWidth: 1, borderColor: WdpColors.border },
  cancelText: { color: WdpColors.muted, fontSize: 14, fontWeight: '600' },
  confirmBtn: { flex: 2, alignItems: 'center', paddingVertical: 14, borderRadius: WdpRadius.sm, backgroundColor: WdpColors.teal },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
