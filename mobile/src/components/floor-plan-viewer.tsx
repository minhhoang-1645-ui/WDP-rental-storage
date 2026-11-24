import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Check, Maximize, Minus, Plus } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { WdpColors as C } from '@/constants/wdp-theme';
import { bookingBlue as blue } from './booking-header';

export type FloorPlanUnit = { id: string; code: string; status: 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'MAINTENANCE'; available: boolean; floor: string | null; zone: string | null; row: number | null; position: number | null };
const fills = { AVAILABLE: '#DCF4E6', RESERVED: '#FFF0CF', OCCUPIED: '#EDF0F4', MAINTENANCE: '#FBE4E6' };
const labels = { AVAILABLE: 'Còn trống', RESERVED: 'Đã giữ', OCCUPIED: 'Đang dùng', MAINTENANCE: 'Bảo trì' };

export function FloorPlanViewer({ units, selectedIds = [], onPress, compact = false }: {
  units: FloorPlanUnit[]; selectedIds?: string[]; onPress?: (unit: FloorPlanUnit) => void; compact?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const scale = useSharedValue(1), x = useSharedValue(0), y = useSharedValue(0);
  const initialScale = useSharedValue(1), initialX = useSharedValue(0), initialY = useSharedValue(0);
  const pinch = Gesture.Pinch().onBegin(() => { initialScale.set(scale.get()); })
    .onUpdate(event => { scale.set(Math.max(1, Math.min(2.4, initialScale.get() * event.scale))); });
  const pan = Gesture.Pan().minDistance(8).onBegin(() => { initialX.set(x.get()); initialY.set(y.get()); })
    .onUpdate(event => { if (scale.get() > 1) { x.set(initialX.get() + event.translationX); y.set(initialY.get() + event.translationY); } });
  const transform = useAnimatedStyle(() => ({ transform: [{ translateX: scale.get() === 1 ? 0 : x.get() }, { translateY: scale.get() === 1 ? 0 : y.get() }, { scale: scale.get() }] }));
  const positions = units.filter(unit => unit.row != null && unit.position != null);
  const rows = [...new Set(positions.map(unit => unit.row))].sort((left, right) => Number(left) - Number(right));
  if (!positions.length) return <View style={s.panel}><Text style={s.label}>Chưa có vị trí được cấu hình cho các ô kho.</Text></View>;
  const columns = compact ? Math.max(1, Math.min(5, Math.floor((width + 4) / 63))) : Math.max(1, Math.floor((width + 4) / 63));
  const cellWidth = (width - (columns - 1) * 4) / columns;
  return <View style={s.panel}>
    <View style={s.toolbar}>
      <Text style={s.label}>Vị trí theo hàng</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Thu nhỏ sơ đồ" style={s.control} onPress={() => scale.set(Math.max(1, scale.get() - 0.35))}><Minus size={16} color={blue} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Phóng to sơ đồ" style={s.control} onPress={() => scale.set(Math.min(2.4, scale.get() + 0.35))}><Plus size={16} color={blue} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Đặt lại sơ đồ" style={s.control} onPress={() => { scale.set(1); x.set(0); y.set(0); }}><Maximize size={15} color={blue} /></Pressable>
    </View>
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
      <View accessibilityLabel="Sơ đồ kho" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={s.viewport}>
        <Animated.View style={[s.rows, transform]}>
          {width > 0 && rows.map(row => <View key={row} style={s.row}>
            {rows.length > 1 && <Text style={s.rowLabel}>Hàng {row}</Text>}
            <View style={s.cells}>{positions.filter(unit => unit.row === row).sort((a, b) => Number(a.position) - Number(b.position)).map(unit => {
              const chosen = selectedIds.includes(unit.id);
              const blocked = unit.status === 'AVAILABLE' && !unit.available;
              const label = blocked ? 'Không trống' : labels[unit.status];
              return <Pressable key={unit.id} accessibilityRole="button" accessibilityLabel={unit.code + ' · ' + label}
                accessibilityState={{ selected: chosen, disabled: !unit.available }} disabled={!unit.available}
                onPress={() => onPress?.(unit)} style={[s.cell, { width: cellWidth, backgroundColor: chosen ? '#E5F0FF' : fills[blocked ? 'OCCUPIED' : unit.status] }, chosen && s.selected]}>
                {chosen && <View style={s.check}><Check size={10} color="white" strokeWidth={3} /></View>}
                <Text style={s.code} adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1}>{unit.code}</Text>
                <Text style={s.status}>{label}</Text>
              </Pressable>;
            })}</View>
          </View>)}
        </Animated.View>
      </View>
    </GestureDetector>
  </View>;
}

const s = StyleSheet.create({
  panel: { backgroundColor: '#F1F4F8', borderColor: '#DCE3EC', borderWidth: 1, borderRadius: 13, padding: 7, gap: 3 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  label: { fontSize: 12, fontWeight: '700', color: C.navy, flex: 1 },
  control: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  viewport: { overflow: 'hidden' },
  rows: { gap: 7 },
  row: { gap: 3 },
  rowLabel: { fontSize: 10, color: C.muted },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { minHeight: 68, borderRadius: 8, borderWidth: 1, borderColor: '#14243B0D', alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 },
  selected: { borderColor: blue, borderWidth: 2 },
  check: { position: 'absolute', top: 3, right: 3, backgroundColor: blue, borderRadius: 8, padding: 2 },
  code: { fontSize: 12, fontWeight: '800', color: '#14243B' },
  status: { fontSize: 10, textAlign: 'center', color: '#293B53' },
});
