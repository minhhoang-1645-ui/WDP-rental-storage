import { StyleSheet, Text, View } from 'react-native';
import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';

type Segment = { value: number; color: string; label: string };

/** Horizontal stacked bar showing warehouse capacity distribution. */
export function CapacityBar({ segments, total }: { segments: Segment[]; total: number }) {
  if (total <= 0) return null;
  return <View style={styles.wrap}>
    <View style={styles.bar}>
      {segments.map(segment => segment.value > 0 ? <View key={segment.label} style={{ flex: segment.value, backgroundColor: segment.color, minWidth: 3 }} /> : null)}
    </View>
    <View style={styles.legend}>
      {segments.map(segment => <View key={segment.label} style={styles.legendItem}>
        <View style={[styles.dot, { backgroundColor: segment.color }]} />
        <Text style={styles.legendText}>{segment.label}</Text>
        <Text style={styles.legendValue}>{segment.value}</Text>
      </View>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: WdpSpacing.sm },
  bar: { flexDirection: 'row', height: 10, borderRadius: WdpRadius.sm, overflow: 'hidden', backgroundColor: WdpColors.border },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: WdpSpacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: WdpColors.muted, fontSize: 11, fontWeight: '500' },
  legendValue: { color: WdpColors.text, fontSize: 11, fontWeight: '700' },
});
