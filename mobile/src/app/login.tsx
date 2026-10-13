import { Button, Host, TextInput } from '@expo/ui';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { WdpColors, WdpSpacing } from '@/constants/wdp-theme';
import type { PublicUser } from '@/types/api';

function destination(user: PublicUser) {
  if (user.role === 'CUSTOMER') return '/customer' as const;
  if (user.role === 'STAFF') return '/staff' as const;
  return '/unsupported' as const;
}

export default function LoginScreen() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  if (user) return <Redirect href={destination(user)} />;

  const submit = async () => {
    if (submitting || !email.trim() || !password) return;
    setSubmitting(true);
    setError('');
    try {
      const loggedInUser = await login(email, password);
      router.replace(destination(loggedInUser));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể đăng nhập.');
    } finally {
      setSubmitting(false);
    }
  };

  return <KeyboardAvoidingView style={styles.root} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.brand}><Text style={styles.logo}>WDP</Text><Text style={styles.brandCaption}>STORAGE MOBILE</Text></View>
      <View style={styles.card}>
        <View style={styles.heading}><Text style={styles.eyebrow}>KHU VỰC VẬN HÀNH</Text><Text style={styles.title}>Đăng nhập</Text><Text style={styles.description}>Customer và Staff sử dụng cùng tài khoản với hệ thống WDP trên web.</Text></View>
        <Host seedColor={WdpColors.navy} style={styles.form}>
          <View style={styles.field}><Text style={styles.label}>Email</Text><TextInput defaultValue={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" returnKeyType="next" placeholder="name@example.com" style={styles.input} /></View>
          <View style={styles.field}><Text style={styles.label}>Mật khẩu</Text><TextInput defaultValue={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" returnKeyType="done" onSubmitEditing={() => void submit()} placeholder="Nhập mật khẩu" style={styles.input} /></View>
          {error ? <Text selectable style={styles.error}>{error}</Text> : null}
          <Button label={submitting ? 'Đang đăng nhập…' : 'Đăng nhập'} disabled={submitting || !email.trim() || !password} onPress={() => void submit()} style={styles.submit} />
        </Host>
      </View>
      <Text style={styles.hint}>Nếu chạy trên điện thoại thật, hãy cấu hình EXPO_PUBLIC_API_URL bằng IP LAN của máy chạy Backend.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: WdpColors.background },
  content: { flexGrow: 1, justifyContent: 'center', gap: WdpSpacing.lg, padding: WdpSpacing.lg },
  brand: { alignItems: 'center' },
  logo: { color: WdpColors.navy, fontSize: 42, fontWeight: '900', letterSpacing: -2 },
  brandCaption: { color: WdpColors.orange, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  card: { gap: WdpSpacing.lg, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 22, borderCurve: 'continuous', backgroundColor: WdpColors.surface, padding: WdpSpacing.lg, boxShadow: '0 18px 50px rgba(15, 23, 42, 0.10)' },
  heading: { gap: WdpSpacing.xs },
  eyebrow: { color: WdpColors.orange, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: WdpColors.navy, fontSize: 30, fontWeight: '900' },
  description: { color: WdpColors.muted, fontSize: 14, lineHeight: 21 },
  form: { gap: WdpSpacing.md, width: '100%' },
  field: { gap: WdpSpacing.xs },
  label: { color: WdpColors.text, fontSize: 13, fontWeight: '800' },
  input: { width: '100%', height: 50, borderWidth: 1, borderColor: WdpColors.border, borderRadius: 12, paddingHorizontal: 14, backgroundColor: '#F8FAFC' },
  error: { color: WdpColors.danger, fontSize: 13, lineHeight: 20 },
  submit: { width: '100%', height: 50, borderRadius: 12 },
  hint: { color: WdpColors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
