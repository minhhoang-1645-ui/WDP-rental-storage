import { InternalPortalLayout } from '../../components/layout/InternalPortalLayout';
import { operationsNavigation, managerPageNavigation } from '../../components/manager/operations-navigation';
import { OperationsWorkspace } from '../../components/manager/operations-workspace';
import '../../styles/workspace-theme.css';
import '../../styles/staff-workspace.css';
import '../../styles/manager-workspace.css';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { safeSessionStorage } from '../../services/browser-storage';
import { useEffect } from 'react';

export function ManagerLayout() {
  const { user } = useAuth();
  const access = useApiResource<{ id: string; name: string }[]>(user ? '/manager/staff/facilities' : null, user?.id, true);
  const facility = !access.error && access.data?.length === 1 ? access.data[0] : undefined;
  useEffect(() => {
    safeSessionStorage.removeItem('nestbox-manager-facility');
    window.dispatchEvent(new Event('nestbox-manager-facility-change'));
  }, [user?.id, facility?.id]);

  const notice = access.loading ? 'Đang tải cơ sở…'
    : access.error || (access.data && access.data.length > 1
      ? 'Tài khoản có nhiều quyền cơ sở. Liên hệ quản trị viên để chuẩn hóa quyền.'
      : 'Chưa được cấp quyền quản lý cơ sở.');
  return <OperationsWorkspace.Provider value="/manager">
    <InternalPortalLayout key={user?.id + ':' + (facility?.id ?? '')} outletContext={facility?.id ?? ''}
      label="Quản lý cơ sở" navigation={operationsNavigation()} pageNavigation={managerPageNavigation()}
      themed scopeReady={Boolean(facility)} scopeControl={<span>{facility?.name ?? notice}</span>}
      scopeNotice={<section className="manager-card" role="status"><h2>Cơ sở quản lý</h2><p>{notice}</p>
        {access.error && <button className="button-secondary" type="button" onClick={access.refresh}>Thử lại</button>}
      </section>} />
  </OperationsWorkspace.Provider>;
}
