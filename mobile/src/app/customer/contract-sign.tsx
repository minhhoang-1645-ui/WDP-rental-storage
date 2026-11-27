import { useEffect, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Check, Info, Mail, Trash2 } from 'lucide-react-native';
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
import { CustomerTheme as C } from '@/constants/wdp-theme';

const otpLength = 6;
type Receipt = { challengeId: string; recipient: string; expiresAt: string; resendAfterSeconds: number };

export default function ContractSign() {
  const { id, reviewedHash } = useLocalSearchParams<{ id: string; reviewedHash?: string }>();
  const { user } = useAuth();
  const path = id ? '/customer/contracts/' + encodeURIComponent(id) : null;
  const source = useResource<Row>(path);
  const pad = useRef<SignaturePadHandle>(null);
  const lock = useRef(false);
  const [agreed, setAgreed] = useState(false);
  const [signatureReady, setSignatureReady] = useState(false);
  const [operation, setOperation] = useState<'send' | 'verify' | null>(null);
  const busy = operation !== null;
  const [error, setError] = useState('');
  const [image, setImage] = useState('');
  const [receipt, setReceipt] = useState<Receipt>();
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [otp, setOtp] = useState('');
  const expiresAt = receipt ? Date.parse(receipt.expiresAt) : 0;
  const expiresIn = Number.isFinite(expiresAt) ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useDraftGuard(true);
  useEffect(() => {
    if (!remaining && !expiresIn) return;
    const refresh = () => setNow(currentTimeMs());
    const timer = setTimeout(refresh, expiresIn > 0 ? Math.min(1000, expiresAt - now) : 1000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [remaining, expiresIn, expiresAt, now]);

  const row = source.data;
  const terms = object(row?.terms);
  const hash = text(terms, 'snapshotHash');
  const reviewed = Boolean(hash && reviewedHash === hash);
  const emailReady = object(terms.otp).emailConfigured !== false;

  async function submit(verify: boolean) {
    if (lock.current || !agreed || !user || !path || !row || !reviewed || !canSignContract(row)) return;
    if (verify ? !receipt || !Number.isFinite(expiresAt) || expiresAt <= currentTimeMs() || otp.length !== otpLength : !emailReady || currentTimeMs() < resendAt) return;
    lock.current = true;
    setOperation(verify ? 'verify' : 'send');
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
        if (!result.challengeId || !Number.isFinite(Date.parse(result.expiresAt)) || !Number.isFinite(result.resendAfterSeconds)) {
          throw new Error('Chưa nhận được thông tin xác thực. Vui lòng thử lại.');
        }
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
      setOperation(null);
    }
  }

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Stack.Screen options={{ title: receipt ? 'Xác thực chữ ký' : 'Ký hợp đồng', headerTitleAlign: 'center', gestureEnabled: !busy, headerBackVisible: !busy }} />
    <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={[s.page, styles.page]}>
      {source.loading ? <LoadingState layout="detail" /> : source.error ? <ErrorState message={source.error} onRetry={source.refresh} />
        : !row ? null : !canSignContract(row) ? <Text style={s.body}>{text(terms, 'acceptedAt') ? 'Hợp đồng đã được ký.' : 'Hợp đồng hiện chưa thể ký.'}</Text>
        : !reviewed ? <>
          <Text style={s.body}>Vui lòng đọc phiên bản hiện tại của hợp đồng trước khi ký.</Text>
          <Button title="Xem hợp đồng" onPress={() => router.replace({ pathname: '/customer/contract-document', params: { id } })} />
        </> : receipt ? <>
          <View style={styles.otpIntro}>
            <View style={styles.mailIcon}><Mail size={32} color="#0758DC" /></View>
            <Text style={s.section}>{expiresIn > 0 ? 'Nhập mã xác thực (OTP)' : 'Mã xác thực đã hết hạn'}</Text>
            <Text style={[s.secondary, { textAlign: 'center' }]}>Mã xác thực đã được gửi đến email {receipt.recipient}.</Text>
            <Text style={s.secondary}>{expiresIn > 0
              ? 'Mã hết hạn sau ' + Math.floor(expiresIn / 60) + ':' + String(expiresIn % 60).padStart(2, '0')
              : 'Mã đã hết hạn. Hãy gửi mã mới.'}</Text>
          </View>
          {expiresIn > 0 && <View>
            <TextInput accessibilityLabel="Mã xác thực email gồm 6 số" value={otp} editable={!busy && expiresIn > 0}
              onChangeText={value => { setOtp(value.replace(/\D/g, '')); setError(''); }} maxLength={otpLength}
              keyboardType="number-pad" autoComplete="one-time-code" caretHidden underlineColorAndroid="transparent"
              style={styles.otpInput} />
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.cells}>
              {Array.from({ length: otpLength }, (_, index) => <View key={index} style={[styles.cell, index === otp.length && styles.current]}>
                <Text style={styles.digit}>{otp[index] ?? ''}</Text></View>)}
            </View>
          </View>}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy || remaining > 0 || !emailReady} onPress={() => void submit(false)} style={styles.center}>
            <Text style={remaining > 0 || busy || !emailReady ? s.secondary : s.link}>{operation === 'send' ? 'Đang gửi lại mã…' : remaining > 0 ? 'Gửi lại sau ' + remaining + ' giây' : emailReady ? 'Gửi lại mã qua email' : 'Chưa thể gửi lại mã qua email'}</Text>
          </Pressable>
          <View style={styles.notice}><Info size={20} color="#0758DC" />
            <Text style={[s.secondary, { flex: 1 }]}>Hợp đồng được ký sau khi hệ thống xác nhận mã hợp lệ.</Text>
          </View>
          {expiresIn > 0 && <Button title={operation === 'verify' ? 'Đang xác nhận chữ ký…' : 'Xác nhận ký'} disabled={busy || expiresIn === 0 || otp.length !== otpLength} onPress={() => void submit(true)} />}
          <Pressable accessibilityRole="button" disabled={busy} style={styles.center} onPress={() => {
            setReceipt(undefined); setImage(''); setOtp(''); setSignatureReady(false); setAgreed(false); setError('');
          }}><Text style={s.link}>Vẽ lại chữ ký</Text></Pressable>
        </> : <>
          <View style={styles.card}>
            <View style={styles.signatureHeader}>
              <Text accessibilityRole="header" style={s.section}>Tạo chữ ký</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Xóa nét ký" disabled={busy}
                style={({ pressed }) => [styles.clear, (pressed || busy) && styles.dimmed]}
                onPress={() => { pad.current?.clear(); setError(''); }}>
                <Trash2 size={16} color={C.cobalt} /><Text style={s.link}>Xóa nét ký</Text>
              </Pressable>
            </View>
            <Text style={s.secondary}>Vẽ chữ ký của bạn trong khung bên dưới.</Text>
            <SignaturePad ref={pad} onValidityChange={setSignatureReady} />
          </View>
          <Pressable accessibilityRole="checkbox"
            accessibilityLabel="Tôi đã đọc và đồng ý với hợp đồng"
            aria-checked={agreed}
            accessibilityState={{ checked: agreed, disabled: busy }} disabled={busy}
            style={({ pressed }) => [styles.card, styles.consent, agreed && styles.selectedConsent, pressed && styles.dimmed]}
            onPress={() => setAgreed(value => !value)}>
            <View style={[styles.checkbox, agreed && styles.checked]}>
              {agreed && <Check size={15} color={C.surface} strokeWidth={3} />}
            </View>
            <Text style={styles.consentTitle}>Tôi đã đọc và đồng ý với hợp đồng</Text>
          </Pressable>
          {!emailReady ? <Text style={s.secondary}>Hiện chưa thể gửi mã qua email. Vui lòng liên hệ NestBox.</Text> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button title={busy ? 'Đang gửi mã…' : remaining ? 'Gửi lại sau ' + remaining + ' giây' : 'Nhận mã xác thực qua email'}
            disabled={busy || !signatureReady || !agreed || !emailReady || remaining > 0} onPress={() => void submit(false)} />
        </>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 16 },
  card: { padding: 14, gap: 10, borderRadius: C.radius, borderWidth: 1, borderColor: C.divider, backgroundColor: C.surface },
  signatureHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12 },
  notice: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderRadius: 11, backgroundColor: '#EDF3FD' },
  otpIntro: { alignItems: 'center', gap: 12, paddingVertical: 12 },
  mailIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#EDF3FD', alignItems: 'center', justifyContent: 'center' },
  clear: { minHeight: 44, paddingHorizontal: 10, flexDirection: 'row', gap: 6, alignItems: 'center', borderRadius: 10, backgroundColor: '#EDF3FD' },
  dimmed: { opacity: 0.6 },
  otpInput: { ...StyleSheet.absoluteFill, color: 'transparent', backgroundColor: 'transparent' },
  cells: { flexDirection: 'row', gap: 6, backgroundColor: 'white' },
  cell: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CDD6E5', borderRadius: 8 },
  current: { borderColor: '#0758DC' },
  digit: { fontSize: 21, fontWeight: '700', color: '#101828' },
  consent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  selectedConsent: { borderColor: C.cobalt, backgroundColor: '#F5F8FF' },
  consentTitle: { flex: 1, color: C.text, fontWeight: '600', fontSize: 15, lineHeight: 22 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: '#81929D', alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: C.cobalt, borderColor: C.cobalt },
  center: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#B42318', fontSize: 14 },
});
