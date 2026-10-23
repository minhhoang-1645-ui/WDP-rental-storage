import { Button, Host } from '@expo/ui';
import { router } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';

export default function CustomerAccountScreen() {
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();
  const buttonStyle = { ...styles.button, width: Platform.OS === "web" ? "100%" as const : Math.max(1, width - 2 * WdpSpacing.md) };
  const signOut = async () => { await logout(); router.replace('/login'); };
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}><PageHeader eyebrow="Tài khoản" title={user?.fullName ?? 'Khách hàng'} description="Thông tin tài khoản đang đăng nhập trên thiết bị này." /><View style={styles.card}><Info label="Email" value={user?.email} /><Info label="Số điện thoại" value={user?.phone} /><Info label="Vai trò" value="Khách hàng" /></View><Host seedColor={WdpColors.navy}><Button label="Đăng xuất" variant="outlined" onPress={() => void signOut()} style={buttonStyle} /></Host></ScrollView>;
}

function Info({ label, value }: { label: string; value?: string | null }) { return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value || '—'}</Text></View>; }

const styles = StyleSheet.create({ content: { gap: WdpSpacing.lg, padding: WdpSpacing.md }, card: { borderWidth: 1, borderColor: WdpColors.border, borderRadius: 16, borderCurve: 'continuous', backgroundColor: WdpColors.surface, paddingHorizontal: WdpSpacing.md }, row: { gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: WdpColors.border, paddingVertical: WdpSpacing.md }, label: { color: WdpColors.muted, fontSize: 12, fontWeight: '700' }, value: { color: WdpColors.text, fontSize: 15, fontWeight: '700' }, button: { width: '100%', height: 48 } });
