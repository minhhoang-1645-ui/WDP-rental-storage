import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react-native';

import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import { SkeletonCard } from './skeleton';

export function LoadingState({ label = 'Đang tải dữ liệu…' }: { label?: string }) {
  return <View style={styles.state}><SkeletonCard /><Text style={styles.description}>{label}</Text></View>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <View style={styles.state}><AlertCircle size={28} color={WdpColors.danger} strokeWidth={1.8} /><Text selectable style={styles.errorTitle}>Chưa thể tải dữ liệu</Text><Text selectable style={styles.description}>{message}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}><RefreshCw size={14} color="white" strokeWidth={2.5} /><Text style={styles.buttonText}>Thử lại</Text></Pressable></View>;
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return <View style={styles.state}><Inbox size={28} color={WdpColors.muted} strokeWidth={1.5} /><Text style={styles.title}>{title}</Text><Text style={styles.description}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', gap: WdpSpacing.sm, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 16, borderCurve: 'continuous', backgroundColor: WdpColors.surface, padding: WdpSpacing.xl },
  title: { color: WdpColors.navy, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  errorTitle: { color: WdpColors.danger, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  description: { color: WdpColors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  button: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, justifyContent: 'center', borderRadius: 12, borderCurve: 'continuous', backgroundColor: WdpColors.navy, paddingHorizontal: WdpSpacing.lg },
  buttonText: { color: 'white', fontWeight: '800' },
});

