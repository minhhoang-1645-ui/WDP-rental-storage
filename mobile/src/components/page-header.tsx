import { StyleSheet, Text, View } from 'react-native';

import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';

export function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <View style={styles.header}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text><Text style={styles.description}>{description}</Text></View>;
}

const styles = StyleSheet.create({
  header: { gap: WdpSpacing.sm, paddingTop: 8, paddingBottom: 8 },
  eyebrow: { color: WdpColors.orange, fontSize: 10, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase' },
  title: { color: WdpColors.navy, fontSize: 28, lineHeight: 36, fontWeight: '700', letterSpacing: -0.7 },
  description: { color: WdpColors.muted, fontSize: 14, lineHeight: 22 },
});
