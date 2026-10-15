import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text } from 'react-native';

import { ActionButton, Field, Panel, SelectField, portalStyles } from '@/components/portal-ui';
import { apiRequest } from '@/services/api';
import type { PublicUser } from '@/types/api';

export default function CreateUser() {
  const [draft, setDraft] = useState({ fullName: '', email: '', phone: '', password: '', role: 'STAFF' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    if (draft.fullName.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()) || draft.phone.trim().length < 8 || draft.password.length < 8) {
      setError('Nhập họ tên từ 2 ký tự, email hợp lệ, số điện thoại từ 8 ký tự và mật khẩu từ 8 ký tự.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const created = await apiRequest<PublicUser>('/admin/users', { method: 'POST', body: JSON.stringify({ ...draft, fullName: draft.fullName.trim(), email: draft.email.trim(), phone: draft.phone.trim() }) });
      setDraft({ fullName: '', email: '', phone: '', password: '', role: 'STAFF' });
      router.replace({ pathname: '/admin/users/[id]', params: { id: created.id, created: '1' } });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa thể tạo tài khoản.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={portalStyles.content}>
      <Panel title="Thông tin tài khoản mới">
        <Text style={portalStyles.muted}>Cấp tài khoản cho nhân viên hoặc quản lý. Khách hàng đăng ký qua khu vực khách hàng.</Text>
        <Field label="Họ và tên" defaultValue={draft.fullName} onChangeText={fullName => setDraft(value => ({ ...value, fullName }))} editable={!busy} maxLength={120} />
        <Field label="Email" defaultValue={draft.email} onChangeText={email => setDraft(value => ({ ...value, email }))} editable={!busy} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} />
        <Field label="Số điện thoại" defaultValue={draft.phone} onChangeText={phone => setDraft(value => ({ ...value, phone }))} editable={!busy} keyboardType="phone-pad" maxLength={25} />
        <Field label="Mật khẩu (8–128 ký tự)" defaultValue={draft.password} onChangeText={password => setDraft(value => ({ ...value, password }))} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={128} />
        <SelectField label="Vai trò" value={draft.role} onChange={role => setDraft(value => ({ ...value, role }))} options={[{ value: 'STAFF', label: 'Nhân viên (Staff)' }, { value: 'MANAGER', label: 'Quản lý (Manager)' }]} disabled={busy} />
      </Panel>
      {error ? <Text selectable style={portalStyles.error}>{error}</Text> : null}
      <ActionButton label={busy ? 'Đang tạo…' : 'Tạo tài khoản'} disabled={busy} onPress={() => void submit()} />
    </ScrollView>
  </KeyboardAvoidingView>;
}

