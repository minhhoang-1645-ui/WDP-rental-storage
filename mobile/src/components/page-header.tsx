import { StyleSheet, Text, View } from 'react-native';

import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';

export function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <View style={styles.header}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text><Text style={styles.description}>{description}</Text></View>;
}

const styles = StyleSheet.create({
  header: { gap: WdpSpacing.xs },
  eyebrow: { color: WdpColors.orange, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: WdpColors.navy, fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
  description: { color: WdpColors.muted, fontSize: 15, lineHeight: 22 },
});
