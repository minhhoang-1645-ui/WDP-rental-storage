import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { ActionButton, InfoRow, Panel, portalStyles } from '@/components/portal-ui';

export default function PortalAccount() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function signOut() {
    if (busy) return;
    setBusy(true);
    try { await logout(); router.replace('/login'); }
    catch { setError('Chưa thể đăng xuất. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={portalStyles.content}>
    <Panel title={user?.fullName ?? 'Tài khoản'}>
      <InfoRow label="Email" value={user?.email ?? '—'} />
      <InfoRow label="Số điện thoại" value={user?.phone || '—'} />
      <InfoRow label="Vai trò" value={user?.role === 'ADMIN' ? 'Quản trị viên' : 'Quản lý cơ sở'} />
    </Panel>
    {error ? <Text style={portalStyles.error}>{error}</Text> : null}
    <ActionButton label={busy ? 'Đang đăng xuất…' : 'Đăng xuất'} onPress={() => void signOut()} disabled={busy} secondary />
  </ScrollView>;
}

