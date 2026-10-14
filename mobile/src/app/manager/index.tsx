import { ScrollView, RefreshControl, Text, View } from 'react-native';

import { useAuth } from '@/auth/use-auth';
import { MetricCard } from '@/components/metric-card';
import { ActionButton, MenuLink, portalStyles } from '@/components/portal-ui';
import { ErrorState, LoadingState } from '@/components/screen-state';
import { usePortalResource } from '@/hooks/use-portal-resource';
import { operationCatalog } from '@/services/operation-catalog';
import type { DashboardSummary } from '@/types/management';

export default function ManagerHome() {
  const { user } = useAuth();
  const resource = usePortalResource<DashboardSummary>('/manager/dashboard/summary');
  const data = resource.data;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={portalStyles.content} refreshControl={<RefreshControl refreshing={resource.refreshing} onRefresh={resource.refresh} />}>
    <Text style={portalStyles.title}>Xin chào, {user?.fullName}</Text>
    <Text style={portalStyles.muted}>Tình hình cơ sở và các hồ sơ cần xử lý.</Text>
    {resource.loading ? <LoadingState /> : null}
    {resource.error ? <ErrorState message={resource.error} onRetry={resource.refresh} /> : null}
    {data ? <View style={portalStyles.row}>
      <MetricCard label="Chờ duyệt đặt kho" value={data.pendingReservations} tone="orange" />
      <MetricCard label="Đang thuê" value={data.activeRentals} />
      <MetricCard label="Quá hạn" value={data.overdueRentals} tone="danger" />
      <MetricCard label="Kho trống" value={data.availableUnits} />
      <MetricCard label="Kho đang sử dụng" value={data.occupiedUnits} />
      <MetricCard label="Kho bảo trì" value={data.maintenanceUnits} tone="orange" />
      <MetricCard label="Lịch sắp tới" value={data.upcomingAppointments} />
      <MetricCard label="Gia hạn chưa xong" value={data.pendingRenewals} />
      <MetricCard label="Hỗ trợ chưa xong" value={data.openSupportRequests} />
      <MetricCard label="Quyết toán chưa xong" value={data.pendingDepositSettlements} />
    </View> : null}
    {Object.entries(operationCatalog).map(([key, config]) => <MenuLink key={key} href={{ pathname: '/manager/[resource]', params: { resource: key } }} title={config.title} description={config.description} />)}
    <MenuLink href="/manager/account" title="Tài khoản" description="Thông tin đăng nhập và đăng xuất." />
    {user?.role === 'ADMIN' ? <MenuLink href="/admin" title="Về quản trị hệ thống" description="Quản lý tài khoản và quyền truy cập." /> : null}
    <ActionButton label="Làm mới số liệu" secondary onPress={resource.refresh} disabled={resource.refreshing} />
  </ScrollView>;
}

