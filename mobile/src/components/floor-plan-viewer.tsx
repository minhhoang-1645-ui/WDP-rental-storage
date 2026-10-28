import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';

export type FloorPlanUnit = { id: string; code: string; status: 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'MAINTENANCE'; x: number; y: number; width: number; height: number };

const fills: Record<FloorPlanUnit['status'], string> = { AVAILABLE: WdpColors.successBackground, RESERVED: WdpColors.warningBackground, OCCUPIED: WdpColors.surfaceSecondary, MAINTENANCE: WdpColors.dangerBackground };
const inks: Record<FloorPlanUnit['status'], string> = { AVAILABLE: WdpColors.success, RESERVED: WdpColors.warning, OCCUPIED: WdpColors.muted, MAINTENANCE: WdpColors.danger };

/** Renders only coordinates supplied by the API. It never derives a physical layout. */
export function FloorPlanViewer({ units, onPress }: { units: FloorPlanUnit[]; onPress?: (unit: FloorPlanUnit) => void }) {
  if (!units.length) return <View style={styles.empty}><Text style={styles.emptyTitle}>Chưa có sơ đồ mặt bằng</Text><Text style={styles.emptyCopy}>WDP chưa cung cấp tọa độ unit, lối đi và điểm vào qua API cho cơ sở này.</Text></View>;
  return <View accessibilityLabel="Sơ đồ kho" style={styles.canvas}>{units.map(unit => <Pressable key={unit.id} accessibilityRole="button" accessibilityLabel={`${unit.code}, ${unit.status}`} onPress={() => onPress?.(unit)} style={({ pressed }) => [styles.unit, { left: `${unit.x}%`, top: `${unit.y}%`, width: `${unit.width}%`, height: `${unit.height}%`, backgroundColor: fills[unit.status], borderColor: inks[unit.status] }, pressed && { opacity: 0.7 }]}><Text numberOfLines={1} style={[styles.unitText, { color: inks[unit.status] }]}>{unit.code}</Text></Pressable>)}</View>;
}

const styles = StyleSheet.create({
  canvas: { aspectRatio: 1.35, borderWidth: 1, borderColor: WdpColors.border, borderRadius: WdpRadius.md, borderCurve: 'continuous', backgroundColor: WdpColors.surface, overflow: 'hidden', position: 'relative' },
  unit: { alignItems: 'center', borderRadius: WdpRadius.sm, borderWidth: 1, justifyContent: 'center', padding: WdpSpacing.xxs, position: 'absolute' },
  unitText: { fontSize: 11, fontWeight: '700' },
  empty: { gap: WdpSpacing.xs, borderWidth: 1, borderColor: WdpColors.border, borderRadius: WdpRadius.md, borderCurve: 'continuous', backgroundColor: WdpColors.surfaceSecondary, padding: WdpSpacing.md },
  emptyTitle: { color: WdpColors.navy, fontSize: 16, fontWeight: '600' },
  emptyCopy: { color: WdpColors.muted, fontSize: 13, lineHeight: 20 },
});
