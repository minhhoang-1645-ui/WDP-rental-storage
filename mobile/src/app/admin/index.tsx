import { ScrollView, RefreshControl, Text, View } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { MetricCard } from '@/components/metric-card';
import { MenuLink, portalStyles } from '@/components/portal-ui';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { usePortalResource } from '@/hooks/use-portal-resource';
import type { Paginated } from '@/types/api';
import type { AdminUser } from '@/types/management';

export default function AdminHome() {
  const { user } = useAuth();
  const all = usePortalResource<Paginated<AdminUser>>('/admin/users?limit=1');
  const staff = usePortalResource<Paginated<AdminUser>>('/admin/users?limit=1&role=STAFF');
  const managers = usePortalResource<Paginated<AdminUser>>('/admin/users?limit=1&role=MANAGER');
  const disabled = usePortalResource<Paginated<AdminUser>>('/admin/users?limit=1&accountStatus=DISABLED');
  const resources = [all, staff, managers, disabled];
  const refresh = () => resources.forEach(resource => resource.refresh());
  const error = resources.find(resource => resource.error)?.error;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={portalStyles.content} refreshControl={<RefreshControl refreshing={resources.some(resource => resource.refreshing)} onRefresh={refresh} />}>
    <Text style={portalStyles.title}>Xin chào, {user?.fullName}</Text>
    <Text style={portalStyles.muted}>Quản lý tài khoản hệ thống và theo dõi vận hành cơ sở.</Text>
    {resources.some(resource => resource.loading) ? <LoadingState /> : null}
    {error ? <ErrorState message={error} onRetry={refresh} /> : null}
    <View style={portalStyles.row}>
      {all.data ? <MetricCard label="Tổng tài khoản" value={all.data.total} /> : null}
      {staff.data ? <MetricCard label="Nhân viên" value={staff.data.total} /> : null}
      {managers.data ? <MetricCard label="Quản lý" value={managers.data.total} tone="orange" /> : null}
      {disabled.data ? <MetricCard label="Đã vô hiệu hóa" value={disabled.data.total} tone="danger" /> : null}
    </View>
    <MenuLink href="/admin/users" title="Quản lý tài khoản" description="Tìm kiếm, lọc vai trò và cập nhật trạng thái hoạt động." />
    <MenuLink href="/admin/users/new" title="Tạo tài khoản nội bộ" description="Cấp tài khoản mới cho nhân viên hoặc quản lý." />
    <MenuLink href="/admin/roles" title="Vai trò và quyền" description="Xem quyền hiện tại của từng nhóm người dùng." />
    <MenuLink href="/manager" title="Vận hành cơ sở" description="Kho, đặt kho, hóa đơn, lịch hẹn và các yêu cầu vận hành." />
    <MenuLink href="/admin/account" title="Tài khoản của tôi" description="Thông tin quản trị viên và đăng xuất." />
  </ScrollView>;
}

