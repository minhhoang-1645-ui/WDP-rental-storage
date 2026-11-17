import { StyleSheet, Text, View } from 'react-native';

import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';

export function MetricCard({ label, value, tone = 'navy' }: { label: string; value: string | number; tone?: 'navy' | 'orange' | 'danger' }) {
  const color = tone === 'orange' ? WdpColors.orange : tone === 'danger' ? WdpColors.danger : WdpColors.navy;
  return <View style={styles.card}><Text style={styles.label}>{label}</Text><Text selectable style={[styles.value, { color }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 140, gap: WdpSpacing.xs, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 12, borderCurve: 'continuous', backgroundColor: WdpColors.surface, padding: 12, boxShadow: '0 3px 12px rgba(32, 62, 81, 0.025)' },
  label: { color: WdpColors.muted, fontSize: 14, fontWeight: '700' },
  value: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
