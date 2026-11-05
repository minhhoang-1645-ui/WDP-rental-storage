import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/page-header';
import { WdpColors, WdpRadius, WdpSpacing } from '@/constants/wdp-theme';
import { Button, Field } from '@/operations/ui';
import { profileContactIssue } from '@/utils/profile-contact';
import { useDraftGuard } from '@/services/live-events';

export default function CustomerAccountScreen() {
  const { user, logout, updateProfile } = useAuth();
  const params = useLocalSearchParams<{ returnTo?: string; product?: string }>();
  const [fullName, setFullName] = useState(user?.fullName ?? ''), [phone, setPhone] = useState(user?.phone ?? '');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const lock = useRef(false);
  const dirty = fullName !== (user?.fullName ?? '') || phone !== (user?.phone ?? '');
  useDraftGuard(dirty || busy);
  const save = async () => {
    if (lock.current) return;
    const issue = profileContactIssue(fullName, phone);
    if (issue) { setError(issue); return; }
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { const updated = await updateProfile({ fullName: fullName.trim(), phone: phone.trim() }); setFullName(updated.fullName); setPhone(updated.phone ?? ''); setNotice('Đã cập nhật thông tin liên hệ. Các hợp đồng đã ký vẫn giữ thông tin tại thời điểm ký.'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa cập nhật được thông tin. Nội dung bạn nhập vẫn được giữ để thử lại.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const signOut = async () => { await logout(); router.replace('/login'); };
  const backToBooking = () => { if (router.canGoBack()) router.back(); else router.replace({ pathname: '/customer/booking', params: params.product ? { product: params.product } : {} }); };
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}><PageHeader eyebrow="Tài khoản" title={user?.fullName ?? 'Khách hàng'} description="Cập nhật tên và số điện thoại để NestBox liên hệ khi xử lý yêu cầu hoặc bàn giao." /><View style={styles.card}><Info label="Email đăng nhập" value={user?.email} /><Info label="Vai trò" value="Khách hàng" /><View style={[styles.row, { gap: 16 }]}><Field title="Họ và tên" autoComplete="name" autoCapitalize="words" value={fullName} onChange={value => { setFullName(value); setNotice(''); }} maxLength={120} disabled={busy} /><Field title="Số điện thoại liên hệ" keyboardType="phone-pad" autoComplete="tel" value={phone} onChange={value => { setPhone(value); setNotice(''); }} maxLength={25} disabled={busy} /><Text style={styles.label}>Email đăng nhập được giữ nguyên. Thông tin cập nhật áp dụng cho những yêu cầu tiếp theo.</Text>{error ? <Text accessibilityRole="alert" style={{ color: WdpColors.danger }}>{error}</Text> : null}{notice ? <Text accessibilityRole="alert" style={{ color: WdpColors.success }}>{notice}</Text> : null}<Button title={busy ? 'Đang lưu thông tin…' : 'Lưu thông tin liên hệ'} onPress={() => void save()} disabled={busy || !dirty} />{params.returnTo === 'booking' && !profileContactIssue(user?.fullName ?? '', user?.phone ?? '') && <Button title="Tiếp tục đặt kho" variant="secondary" onPress={backToBooking} disabled={busy || dirty} />}</View></View><Pressable accessibilityRole="button" disabled={busy} onPress={() => void signOut()} style={({ pressed }) => [styles.logoutButton, (pressed || busy) && styles.logoutPressed]}><Text style={styles.logoutText}>Đăng xuất</Text></Pressable></ScrollView>;
}

function Info({ label, value }: { label: string; value?: string | null }) { return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value || '—'}</Text></View>; }

const styles = StyleSheet.create({ content: { gap: WdpSpacing.lg, padding: WdpSpacing.md, paddingBottom: 100 }, card: { borderWidth: 1, borderColor: WdpColors.border, borderRadius: 16, borderCurve: 'continuous', backgroundColor: WdpColors.surface, paddingHorizontal: WdpSpacing.md }, row: { gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: WdpColors.border, paddingVertical: WdpSpacing.md }, label: { color: WdpColors.muted, fontSize: 12, fontWeight: '700' }, value: { color: WdpColors.text, fontSize: 15, fontWeight: '700' }, logoutButton: { alignItems: 'center', borderWidth: 1.5, borderColor: WdpColors.navy, borderRadius: WdpRadius.md, height: 48, justifyContent: 'center' }, logoutPressed: { opacity: 0.7, backgroundColor: WdpColors.surfaceSecondary }, logoutText: { color: WdpColors.navy, fontSize: 15, fontWeight: '700' } });
