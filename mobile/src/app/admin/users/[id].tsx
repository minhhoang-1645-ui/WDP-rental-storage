import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { ActionButton, InfoRow, Panel, portalStyles } from '@/components/portal-ui';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { usePortalResource } from '@/hooks/use-portal-resource';
import { apiRequest } from '@/services/api';
import type { AdminUser } from '@/types/management';
import { statusLabel } from '@/utils/format';

export default function UserDetailRoute() {
  const { id, created } = useLocalSearchParams<{ id: string; created?: string }>();
  return <UserDetail key={id} id={id} created={created === '1'} />;
}

function UserDetail({ id, created }: { id: string; created: boolean }) {
  const { user } = useAuth();
  const result = usePortalResource<AdminUser>(`/admin/users/${encodeURIComponent(id)}`);
  const data = result.data;
  const [target, setTarget] = useState<'ACTIVE' | 'DISABLED' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(created ? 'Đã tạo tài khoản thành công.' : '');
  const lock = useRef(false);
  async function updateStatus() {
    if (!target || !data || data.id === user?.id || lock.current || result.refreshing || result.error) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/admin/users/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ accountStatus: target }) });
      setTarget(null);
      setSuccess('Đã cập nhật trạng thái tài khoản.');
      result.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Chưa thể cập nhật.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={portalStyles.content} refreshControl={<RefreshControl refreshing={result.refreshing} onRefresh={result.refresh} />}>
    {result.loading ? <LoadingState /> : null}
    {result.error ? <ErrorState message={result.error} onRetry={result.refresh} /> : null}
    {success ? <Text selectable style={portalStyles.success}>{success}</Text> : null}
    {data ? <>
      <Panel title={data.fullName}>
        <InfoRow label="Email" value={data.email} /><InfoRow label="Số điện thoại" value={data.phone || '—'} />
        <InfoRow label="Vai trò" value={statusLabel(data.role)} />
        <InfoRow label="Trạng thái" value={data.accountStatus === 'ACTIVE' ? 'Đang hoạt động' : 'Đã vô hiệu hóa'} />
      </Panel>
      {data.id === user?.id ? <Text style={portalStyles.muted}>Đây là tài khoản đang đăng nhập. Không thể tự vô hiệu hóa tại màn hình này.</Text> : <Panel title="Trạng thái hoạt động">
        <ActionButton label={data.accountStatus === 'ACTIVE' ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt lại tài khoản'} secondary disabled={busy || result.refreshing || Boolean(result.error)} onPress={() => { setTarget(data.accountStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'); setError(''); setSuccess(''); }} />
        {target ? <>
          <Text style={portalStyles.text}>{target === 'DISABLED' ? 'Tài khoản sẽ không thể đăng nhập. Lịch sử nghiệp vụ vẫn được giữ nguyên.' : 'Cho phép tài khoản đăng nhập trở lại.'}</Text>
          <Text selectable style={portalStyles.text}>{data.email}</Text>
          {error ? <Text selectable style={portalStyles.error}>{error}</Text> : null}
          <ActionButton label={busy ? 'Đang lưu…' : 'Xác nhận thay đổi'} disabled={busy || result.refreshing || Boolean(result.error)} onPress={() => void updateStatus()} />
          <ActionButton label="Hủy" secondary disabled={busy} onPress={() => setTarget(null)} />
        </> : null}
      </Panel>}
    </> : null}
  </ScrollView>;
}

