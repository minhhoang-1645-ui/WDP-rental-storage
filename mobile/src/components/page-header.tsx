import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Info } from 'lucide-react-native';
import { shortLabel } from '@/utils/ui-labels';
import { useStaffPresentation } from '@/components/staff-ui';
import { useCustomerPresentation } from '@/components/customer-presentation';

import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';

export function PageHeader({ title, description }: { eyebrow: string; title: string; description: string }) {
  const [showHelp, setShowHelp] = useState(false);
  const isStaff = useStaffPresentation();
  const customer = useCustomerPresentation();
  const staff = isStaff || customer;
  return <View style={styles.header}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <Text accessibilityRole="header" style={[styles.title, { flex: 1 }, staff && { fontSize: 22, lineHeight: 30 }]}>{shortLabel(title)}</Text>
    {Boolean(description) && <Pressable accessibilityRole="button" accessibilityLabel="Hướng dẫn trang" accessibilityState={{ expanded: showHelp }} onPress={() => setShowHelp(value => !value)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Info size={21} color={WdpColors.muted} /></Pressable>}
  </View>{showHelp && <Text style={styles.description}>{description}</Text>}</View>;
}

const styles = StyleSheet.create({
  header: { gap: WdpSpacing.sm, paddingTop: 8, paddingBottom: 8 },
  eyebrow: { color: WdpColors.orange, fontSize: 10, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase' },
  title: { color: WdpColors.text, fontSize: 24, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4 },
  description: { color: WdpColors.muted, fontSize: 14, lineHeight: 22 },
});
