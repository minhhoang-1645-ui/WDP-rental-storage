import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';

export default function CustomerAccountScreen() {
  const { user, logout } = useAuth();
  const signOut = async () => { await logout(); router.replace('/login'); };
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}><PageHeader eyebrow="Tài khoản" title={user?.fullName ?? 'Khách hàng'} description="Thông tin tài khoản đang đăng nhập trên thiết bị này." /><View style={styles.card}><Info label="Email" value={user?.email} /><Info label="Số điện thoại" value={user?.phone} /><Info label="Vai trò" value="Khách hàng" /></View><Pressable accessibilityRole="button" onPress={() => void signOut()} style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutPressed]}><Text style={styles.logoutText}>Đăng xuất</Text></Pressable></ScrollView>;
}

function Info({ label, value }: { label: string; value?: string | null }) { return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value || '—'}</Text></View>; }

const styles = StyleSheet.create({ content: { gap: WdpSpacing.lg, padding: WdpSpacing.md, paddingBottom: 100 }, card: { borderWidth: 1, borderColor: WdpColors.border, borderRadius: 16, borderCurve: 'continuous', backgroundColor: WdpColors.surface, paddingHorizontal: WdpSpacing.md }, row: { gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: WdpColors.border, paddingVertical: WdpSpacing.md }, label: { color: WdpColors.muted, fontSize: 12, fontWeight: '700' }, value: { color: WdpColors.text, fontSize: 15, fontWeight: '700' }, logoutButton: { alignItems: 'center', borderWidth: 1.5, borderColor: WdpColors.navy, borderRadius: WdpRadius.md, height: 48, justifyContent: 'center' }, logoutPressed: { opacity: 0.7, backgroundColor: WdpColors.surfaceSecondary }, logoutText: { color: WdpColors.navy, fontSize: 15, fontWeight: '700' } });
