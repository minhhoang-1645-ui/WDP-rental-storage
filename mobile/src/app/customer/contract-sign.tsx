import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Info, Mail, Trash2 } from 'lucide-react-native';
import { useAuth } from '@/auth/use-auth';
import { useResource } from '@/operations/use-resource';
import { object, text, type Row } from '@/operations/model';
import { apiRequest } from '@/services/api';
import { useDraftGuard } from '@/services/live-events';
import { SignaturePad } from '@/components/signature-pad';
import type { SignaturePadHandle } from '@/components/signature-pad.types';
import { Button } from '@/operations/ui';
import { customerStyles as s } from '@/components/customer-premium';
import { LoadingState, ErrorState } from '@/components/screen-state';
import { canSignContract } from '@/components/customer-contracts';
import { currentTimeMs } from '@/utils/calendar-date';

const otpLength = 6;
type Receipt = { challengeId: string; recipient: string; resendAfterSeconds: number };

export default function ContractSign() {
  const { id, reviewedHash } = useLocalSearchParams<{ id: string; reviewedHash?: string }>();
  const { user } = useAuth();
  const path = id ? '/customer/contracts/' + encodeURIComponent(id) : null;
  const source = useResource<Row>(path);
  const pad = useRef<SignaturePadHandle>(null);
  const lock = useRef(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [image, setImage] = useState('');
  const [receipt, setReceipt] = useState<Receipt>();
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [otp, setOtp] = useState('');
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useDraftGuard(true);
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [remaining, now]);

  const row = source.data;
  const terms = object(row?.terms);
  const hash = text(terms, 'snapshotHash');
  const reviewed = Boolean(hash && reviewedHash === hash);
  const emailReady = object(terms.otp).emailConfigured !== false;

  async function submit(verify: boolean) {
    if (lock.current || !agreed || !user || !path || !row || !reviewed || !canSignContract(row)) return;
    if (verify ? !receipt || otp.length !== otpLength : !emailReady || currentTimeMs() < resendAt) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const signatureImage = image || await pad.current?.capture();
      if (!signatureImage) throw new Error('Vui lòng vẽ chữ ký.');
      const body = { agreed: true, acceptanceName: user.fullName, signatureImage, snapshotHash: hash };
      if (verify) {
        await apiRequest(path + '/accept', { method: 'POST', body: JSON.stringify({ ...body, challengeId: receipt?.challengeId, otp }) });
        router.dismissTo({ pathname: '/customer/[resource]/[id]', params: { resource: 'contracts', id } });
      } else {
        const result = await apiRequest<Receipt>(path + '/signature-otp', { method: 'POST', body: JSON.stringify(body) });
        const sentAt = currentTimeMs();
        setImage(signatureImage);
        setReceipt(result);
        setResendAt(sentAt + result.resendAfterSeconds * 1000);
        setNow(sentAt);
        setOtp('');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chưa xác nhận được chữ ký.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'white' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Stack.Screen options={{ title: receipt ? 'Xác thực chữ ký' : 'Ký hợp đồng', headerTitleAlign: 'center', gestureEnabled: !busy, headerBackVisible: !busy }} />
    <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={s.page}>
      {source.loading ? <LoadingState layout="detail" /> : source.error ? <ErrorState message={source.error} onRetry={source.refresh} />
        : !row ? null : !canSignContract(row) ? <Text style={s.body}>{text(terms, 'acceptedAt') ? 'Hợp đồng đã được ký.' : 'Hợp đồng hiện chưa thể ký.'}</Text>
        : !reviewed ? <>
          <Text style={s.body}>Vui lòng đọc phiên bản hiện tại của hợp đồng trước khi ký.</Text>
          <Button title="Xem hợp đồng" onPress={() => router.replace({ pathname: '/customer/contract-document', params: { id } })} />
        </> : receipt ? <>
          <View style={styles.otpIntro}>
            <View style={styles.mailIcon}><Mail size={32} color="#0758DC" /></View>
            <Text style={s.section}>Nhập mã xác thực (OTP)</Text>
            <Text style={[s.secondary, { textAlign: 'center' }]}>Mã xác thực đã được gửi đến email {receipt.recipient}.</Text>
          </View>
          <View>
            <TextInput accessibilityLabel="Mã xác thực email gồm 6 số" value={otp} editable={!busy}
              onChangeText={value => { setOtp(value.replace(/\D/g, '')); setError(''); }} maxLength={otpLength}
              keyboardType="number-pad" autoComplete="one-time-code" caretHidden underlineColorAndroid="transparent"
              style={styles.otpInput} />
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.cells}>
              {Array.from({ length: otpLength }, (_, index) => <View key={index} style={[styles.cell, index === otp.length && styles.current]}>
                <Text style={styles.digit}>{otp[index] ?? ''}</Text></View>)}
            </View>
          </View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy || remaining > 0} onPress={() => void submit(false)} style={styles.center}>
            <Text style={remaining > 0 ? s.secondary : s.link}>{remaining > 0 ? 'Gửi lại sau ' + remaining + ' giây' : 'Không nhận được mã? Gửi lại mã'}</Text>
          </Pressable>
          <View style={styles.notice}><Info size={20} color="#0758DC" />
            <Text style={[s.secondary, { flex: 1 }]}>Hợp đồng được ký sau khi hệ thống xác nhận mã hợp lệ.</Text>
          </View>
          <Button title={busy ? 'Đang xử lý…' : 'Xác nhận ký'} disabled={busy || otp.length !== otpLength} onPress={() => void submit(true)} />
          <Pressable accessibilityRole="button" disabled={busy} style={styles.center} onPress={() => {
            setReceipt(undefined); setImage(''); setOtp(''); setAgreed(false); setError('');
          }}><Text style={s.link}>Vẽ lại chữ ký</Text></Pressable>
        </> : <>
          <Text style={s.section}>Tạo chữ ký</Text>
          <Text style={s.secondary}>Vẽ chữ ký của bạn vào khung dưới đây.</Text>
          <SignaturePad ref={pad} />
          <Pressable accessibilityRole="button" disabled={busy} style={styles.clear} onPress={() => pad.current?.clear()}>
            <Trash2 size={17} color="#0758DC" /><Text style={s.link}>Xóa nét ký</Text>
          </Pressable>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agreed, disabled: busy }} disabled={busy}
            style={styles.tap} onPress={() => setAgreed(value => !value)}>
            <Text style={s.body}>{agreed ? '☑' : '☐'} Tôi đã đọc và đồng ý với hợp đồng {text(terms, 'document.contractCode')} · phiên bản {text(terms, 'version')}.</Text>
          </Pressable>
          {!emailReady ? <Text style={s.secondary}>Hiện chưa thể gửi mã qua email. Vui lòng liên hệ NestBox.</Text> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button title={busy ? 'Đang gửi mã…' : remaining ? 'Gửi lại sau ' + remaining + ' giây' : 'Nhận mã xác thực qua email'}
            disabled={busy || !agreed || !emailReady || remaining > 0} onPress={() => void submit(false)} />
        </>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderRadius: 11, backgroundColor: '#EDF3FD' },
  otpIntro: { alignItems: 'center', gap: 12, paddingVertical: 12 },
  mailIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#EDF3FD', alignItems: 'center', justifyContent: 'center' },
  clear: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CDD6E5', borderRadius: 8 },
  otpInput: { ...StyleSheet.absoluteFill, color: 'transparent', backgroundColor: 'transparent' },
  cells: { flexDirection: 'row', gap: 6, backgroundColor: 'white' },
  cell: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CDD6E5', borderRadius: 8 },
  current: { borderColor: '#0758DC' },
  digit: { fontSize: 21, fontWeight: '700', color: '#101828' },
  tap: { minHeight: 44, justifyContent: 'center' },
  center: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#B42318', fontSize: 14 },
});
