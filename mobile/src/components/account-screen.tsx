import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';

const roleLabels = {
  CUSTOMER: 'Khách hàng',
  STAFF: 'Nhân viên',
  MANAGER: 'Quản lý',
  ADMIN: 'Quản trị viên',
};

export function AccountScreen() {
  const { user, logout } = useAuth();
  const role = user ? roleLabels[user.role] : undefined;
  const signOut = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <PageHeader eyebrow="Tài khoản" title={user?.fullName ?? role ?? 'Tài khoản'} description="Thông tin tài khoản đang đăng nhập trên thiết bị này." />
      <View style={styles.card}>
        <Info label="Email" value={user?.email} />
        <Info label="Số điện thoại" value={user?.phone} />
        <Info label="Vai trò" value={role} />
      </View>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutPressed]}>
        <Text style={styles.logoutText}>Đăng xuất</Text>
      </Pressable>
    </ScrollView>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text selectable style={styles.value}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: WdpSpacing.lg, padding: WdpSpacing.md, paddingBottom: 100 },
  card: { borderWidth: 1, borderColor: WdpColors.border, borderRadius: WdpRadius.lg, borderCurve: 'continuous', backgroundColor: WdpColors.surface, paddingHorizontal: WdpSpacing.md },
  row: { gap: WdpSpacing.xxs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: WdpColors.border, paddingVertical: WdpSpacing.md },
  label: { color: WdpColors.muted, fontSize: 12, fontWeight: '700' },
  value: { color: WdpColors.text, fontSize: 15, fontWeight: '700' },
  logoutButton: { alignItems: 'center', borderWidth: 1.5, borderColor: WdpColors.navy, borderRadius: WdpRadius.md, minHeight: 48, justifyContent: 'center', padding: WdpSpacing.xs },
  logoutPressed: { opacity: 0.7, backgroundColor: WdpColors.surfaceSecondary },
  logoutText: { color: WdpColors.navy, fontSize: 15, fontWeight: '700' },
});
