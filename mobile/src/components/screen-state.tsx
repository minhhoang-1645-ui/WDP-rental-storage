import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';

export function LoadingState({ label = 'Đang tải dữ liệu…' }: { label?: string }) {
  return <View style={styles.state}><ActivityIndicator color={WdpColors.orange} /><Text style={styles.description}>{label}</Text></View>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <View style={styles.state}><Text selectable style={styles.errorTitle}>Chưa thể tải dữ liệu</Text><Text selectable style={styles.description}>{message}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}><Text style={styles.buttonText}>Thử lại</Text></Pressable></View>;
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return <View style={styles.state}><Text style={styles.title}>{title}</Text><Text style={styles.description}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', gap: WdpSpacing.sm, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 16, borderCurve: 'continuous', backgroundColor: WdpColors.surface, padding: WdpSpacing.xl },
  title: { color: WdpColors.navy, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  errorTitle: { color: WdpColors.danger, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  description: { color: WdpColors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  button: { minHeight: 44, justifyContent: 'center', borderRadius: 12, borderCurve: 'continuous', backgroundColor: WdpColors.navy, paddingHorizontal: WdpSpacing.lg },
  buttonText: { color: 'white', fontWeight: '800' },
});
