import { Button, Host } from '@expo/ui';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';

export default function UnsupportedRoleScreen() {
  const { user, logout } = useAuth();
  const signOut = async () => { await logout(); router.replace('/login'); };
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}><View style={styles.card}><Text style={styles.title}>Tài khoản {user?.role}</Text><Text style={styles.description}>Ứng dụng mobile hiện ưu tiên Customer và Staff. Manager/Admin tiếp tục sử dụng web portal.</Text><Host seedColor={WdpColors.navy}><Button label="Đăng xuất" onPress={() => void signOut()} /></Host></View></ScrollView>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', backgroundColor: WdpColors.background, padding: WdpSpacing.lg },
  card: { gap: WdpSpacing.md, borderRadius: 18, borderCurve: 'continuous', backgroundColor: WdpColors.surface, padding: WdpSpacing.lg },
  title: { color: WdpColors.navy, fontSize: 25, fontWeight: '900' },
  description: { color: WdpColors.muted, fontSize: 15, lineHeight: 22 },
});
