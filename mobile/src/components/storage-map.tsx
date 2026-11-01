import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';
import type { FloorPlanUnit } from './floor-plan-viewer';

export function StorageMap({ units, dimensions, selectedId, onSelect }: { units: FloorPlanUnit[]; dimensions: string; selectedId?: string; onSelect: (unit: FloorPlanUnit) => void }) {
  const sides = dimensions.replace(/,/g, '.').match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  // A shared scale plus touch padding keeps even small lockers readable.
  const width = Math.min(400, 64 + (sides[0] || 1) * 32);
  const height = Math.min(400, 48 + (sides[1] || 1) * 32);
  const positioned = units.filter(unit => unit.row !== null && unit.position !== null);
  const missing = units.filter(unit => unit.row === null || unit.position === null);
  const rowNumbers = [...new Set(positioned.map(unit => unit.row!))].sort((a, b) => a - b);
  const positions = [...new Set(positioned.map(unit => unit.position!))].sort((a, b) => a - b);
  const block = (unit: FloorPlanUnit) => <Pressable key={unit.id} accessibilityRole="button" accessibilityState={{ selected: selectedId === unit.id, disabled: !unit.available }} accessibilityLabel={unit.code + (unit.available ? ', còn kho' : ', hết kho')} disabled={!unit.available} onPress={() => onSelect(unit)} style={({ pressed }) => [local.unit, { width, height, backgroundColor: unit.available ? WdpColors.success : WdpColors.danger, borderColor: selectedId === unit.id ? WdpColors.navyStrong : 'transparent', opacity: pressed ? 0.75 : 1 }]}>
    {selectedId === unit.id && <Check size={18} color={WdpColors.surface} />}<Text style={local.code}>{unit.code}</Text><Text style={local.status}>{unit.available ? 'Còn' : 'Hết'}</Text>
  </Pressable>;
  return <View style={{ gap: WdpSpacing.sm }}>
    <View style={local.legend}><Text style={{ color: WdpColors.success }}>● Còn kho</Text><Text style={{ color: WdpColors.danger }}>● Hết kho</Text></View>
    <Text style={local.hint}>Vuốt ngang để xem vị trí · Chạm kho xanh để đặt</Text>
    <ScrollView horizontal nestedScrollEnabled contentContainerStyle={local.canvas}>
      <View style={{ gap: WdpSpacing.lg }}>{rowNumbers.map(row => <View key={row} style={{ gap: WdpSpacing.xs }}><Text style={local.hint}>Hàng {row}</Text><View style={local.row}>{positions.map(position => { const unit = positioned.find(item => item.row === row && item.position === position); return unit ? block(unit) : <View key={position} style={{ width, height }} />; })}</View></View>)}</View>
    </ScrollView>
    {missing.length > 0 && <View style={{ gap: WdpSpacing.xs }}><Text style={local.hint}>Chưa gắn vị trí ({missing.length})</Text><ScrollView horizontal contentContainerStyle={local.row}>{missing.map(block)}</ScrollView></View>}
    <Text style={local.hint}>Kích thước minh họa theo loại kho; xem số đo khi chọn.</Text>
  </View>;
}
const local = StyleSheet.create({
  canvas: { padding: WdpSpacing.md, backgroundColor: WdpColors.surfaceSecondary, borderRadius: WdpRadius.md, minWidth: '100%' },
  row: { flexDirection: 'row', gap: WdpSpacing.sm },
  unit: { borderWidth: 3, borderRadius: WdpRadius.sm, borderCurve: 'continuous', padding: WdpSpacing.xs, alignItems: 'center', justifyContent: 'center', gap: WdpSpacing.xxs },
  code: { color: WdpColors.surface, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  status: { color: WdpColors.surface, fontSize: 12 },
  legend: { flexDirection: 'row', gap: WdpSpacing.md },
  hint: { color: WdpColors.muted, fontSize: 12, lineHeight: 18 },
});
