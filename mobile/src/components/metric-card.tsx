import { StyleSheet, Text, View } from 'react-native';

import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';

export function MetricCard({ label, value, tone = 'navy' }: { label: string; value: string | number; tone?: 'navy' | 'orange' | 'danger' }) {
  const color = tone === 'orange' ? WdpColors.orange : tone === 'danger' ? WdpColors.danger : WdpColors.navy;
  return <View style={styles.card}><Text style={styles.label}>{label}</Text><Text selectable style={[styles.value, { color }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 140, gap: WdpSpacing.xs, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 16, borderCurve: 'continuous', backgroundColor: WdpColors.surface, padding: WdpSpacing.md, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)' },
  label: { color: WdpColors.muted, fontSize: 12, fontWeight: '700' },
  value: { fontSize: 25, fontWeight: '900', fontVariant: ['tabular-nums'] },
});
