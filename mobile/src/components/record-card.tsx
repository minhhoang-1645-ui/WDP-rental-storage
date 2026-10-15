import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { statusLabel } from '@/utils/format';

export function RecordCard({ code, title, detail, status, onPress }: { code: string; title: string; detail?: string; status: string; onPress?: () => void }) {
  const content = <><View style={styles.heading}><Text selectable style={styles.code}>{code}</Text><View style={styles.badge}><Text style={styles.badgeText}>{statusLabel(status)}</Text></View></View><Text style={styles.title}>{title}</Text>{detail ? <Text selectable style={styles.detail}>{detail}</Text> : null}</>;
  return onPress
    ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>{content}</Pressable>
    : <View style={styles.card}>{content}</View>;
}

const styles = StyleSheet.create({
  card: { gap: WdpSpacing.sm, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 20, borderCurve: 'continuous', backgroundColor: WdpColors.surface, padding: 20, boxShadow: '0 3px 12px rgba(32, 62, 81, 0.025)' },
  pressed: { opacity: 0.72 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: WdpSpacing.sm },
  code: { flex: 1, color: WdpColors.navy, fontSize: 15, fontWeight: '700' },
  badge: { borderRadius: 999, backgroundColor: '#FFF4E8', paddingHorizontal: WdpSpacing.sm, paddingVertical: 5 },
  badgeText: { color: WdpColors.warning, fontSize: 11, fontWeight: '800' },
  title: { color: WdpColors.text, fontSize: 15, fontWeight: '700' },
  detail: { color: WdpColors.muted, fontSize: 13, lineHeight: 20 },
});
