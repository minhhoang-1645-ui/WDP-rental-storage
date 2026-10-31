import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';
import { Calendar } from 'lucide-react-native';

/**
 * Cross-platform date input.
 * On web: renders native `<input type="date">`.
 * On native: renders a text field with format hint that opens a simple year/month/day picker modal.
 */
export function DateField({ title, value, onChange, min }: { title: string; value: string; onChange: (value: string) => void; min?: string }) {
  const [modal, setModal] = useState(false);
  const [tempYear, setTempYear] = useState(() => value.slice(0, 4) || String(new Date().getFullYear()));
  const [tempMonth, setTempMonth] = useState(() => value.slice(5, 7) || String(new Date().getMonth() + 1).padStart(2, '0'));
  const [tempDay, setTempDay] = useState(() => value.slice(8, 10) || '01');

  const openPicker = () => {
    setTempYear(value.slice(0, 4) || String(new Date().getFullYear()));
    setTempMonth(value.slice(5, 7) || String(new Date().getMonth() + 1).padStart(2, '0'));
    setTempDay(value.slice(8, 10) || '01');
    setModal(true);
  };

  const confirm = () => {
    const result = `${tempYear}-${tempMonth.padStart(2, '0')}-${tempDay.padStart(2, '0')}`;
    onChange(result);
    setModal(false);
  };

  if (Platform.OS === 'web') {
    return <View style={local.field}>
      <Text style={local.label}>{title}</Text>
      <TextInput accessibilityLabel={title} value={value} onChangeText={onChange} maxLength={10} placeholder="YYYY-MM-DD" placeholderTextColor={WdpColors.muted} style={local.input} />
    </View>;
  }

  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() + i));

  return <View style={local.field}>
    <Text style={local.label}>{title}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${value || 'chưa chọn'}`} onPress={openPicker} style={local.touchInput}>
      <Text style={value ? local.inputText : local.placeholder}>{value || 'Chọn ngày'}</Text>
      <Calendar size={18} color={WdpColors.muted} strokeWidth={1.8} />
    </Pressable>
    <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
      <Pressable style={local.overlay} onPress={() => setModal(false)}>
        <Pressable style={local.sheet} onPress={e => e.stopPropagation()}>
          <Text style={local.sheetTitle}>Chọn ngày</Text>
          <View style={local.pickerRow}>
            <View style={local.pickerCol}>
              <Text style={local.pickerLabel}>Năm</Text>
              {years.map(y => <Pressable key={y} onPress={() => setTempYear(y)} style={[local.option, tempYear === y && local.optionActive]}><Text style={[local.optionText, tempYear === y && local.optionTextActive]}>{y}</Text></Pressable>)}
            </View>
            <View style={local.pickerCol}>
              <Text style={local.pickerLabel}>Tháng</Text>
              {months.map(m => <Pressable key={m} onPress={() => setTempMonth(m)} style={[local.option, tempMonth === m && local.optionActive]}><Text style={[local.optionText, tempMonth === m && local.optionTextActive]}>{m}</Text></Pressable>)}
            </View>
            <View style={local.pickerCol}>
              <Text style={local.pickerLabel}>Ngày</Text>
              {days.map(d => <Pressable key={d} onPress={() => setTempDay(d)} style={[local.option, tempDay === d && local.optionActive]}><Text style={[local.optionText, tempDay === d && local.optionTextActive]}>{d}</Text></Pressable>)}
            </View>
          </View>
          <Text style={local.preview}>{tempYear}-{tempMonth}-{tempDay}</Text>
          <View style={local.sheetActions}>
            <Pressable onPress={() => setModal(false)} style={local.cancelBtn}><Text style={local.cancelText}>Hủy</Text></Pressable>
            <Pressable onPress={confirm} style={local.confirmBtn}><Text style={local.confirmText}>Chọn ngày này</Text></Pressable>
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
  option: { alignItems: 'center', paddingVertical: 6, borderRadius: WdpRadius.sm },
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
