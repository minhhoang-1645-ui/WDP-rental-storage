import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from '@/components/customer-ui';
import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';
import { codeOf, label, text, type Row } from '@/operations/model';
import { formatDate } from '@/utils/format';

export function TaskCard({ item, kind, onPress }: { item: Row; kind: string; onPress: () => void }) {
  const unit = text(item, 'unit.unitCode', 'storageUnit.unitCode', 'fromUnit.unitCode');
  const customer = text(item, 'customer.fullName', 'reservation.customer.fullName');
  const when = text(item, 'scheduledAt', 'requestedAt', 'createdAt');
  return <Pressable accessibilityRole="button" accessibilityLabel={`Mở công việc ${codeOf(item)}`} onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.74 }]}>
    <View style={styles.heading}><View style={{ flex: 1, gap: WdpSpacing.xxs }}><Text selectable style={styles.code}>{codeOf(item)}</Text><Text style={styles.kind}>{kind}{item.priority ? ` · ${label(item.priority)}` : ''}</Text></View><StatusBadge status={String(item.status)} /></View>
    <View style={styles.details}>{unit ? <Text selectable style={styles.detail}>Kho: {unit}</Text> : null}{customer ? <Text selectable style={styles.detail}>Khách: {customer}</Text> : null}{when ? <Text selectable style={styles.detail}>Thời gian: {formatDate(when, true)}</Text> : null}</View>
    <Text numberOfLines={2} style={styles.summary}>{text(item, 'subject', 'description') || 'Mở hồ sơ để xem việc cần làm và thao tác được phép.'}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { gap: WdpSpacing.sm, backgroundColor: WdpColors.surface, borderColor: WdpColors.border, borderCurve: 'continuous', borderRadius: WdpRadius.md, borderWidth: 1, padding: WdpSpacing.md },
  heading: { alignItems: 'flex-start', flexDirection: 'row', gap: WdpSpacing.sm, justifyContent: 'space-between' },
  code: { color: WdpColors.navy, fontSize: 15, fontWeight: '700' },
  kind: { color: WdpColors.teal, fontSize: 13, fontWeight: '600' },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: WdpSpacing.xs },
  detail: { color: WdpColors.muted, fontSize: 12, lineHeight: 18 },
  summary: { color: WdpColors.text, fontSize: 14, lineHeight: 20 },
});
