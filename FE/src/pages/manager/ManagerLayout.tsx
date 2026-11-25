import { InternalPortalLayout } from "../../components/layout/InternalPortalLayout";
import { operationsNavigation, managerPageNavigation } from "../../components/manager/operations-navigation";
import { OperationsWorkspace } from '../../components/manager/operations-workspace';
import '../../styles/workspace-theme.css';
import '../../styles/staff-workspace.css';
import '../../styles/manager-workspace.css';
import { useAuth } from '../../auth/auth-context';
import { useApiResource } from '../../services/useApiResource';
import { safeSessionStorage } from '../../services/browser-storage';
import { useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

export function ManagerLayout() {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const targetFacility = ['/manager/catalog', '/manager/catalog/additional-services'].includes(pathname)
    ? new URLSearchParams(search).get('facilityId') : null;
  const facilities = useApiResource<{ id: string; name: string; code: string }[]>('/manager/staff/facilities', user?.id, true);
  const [selected, setSelected] = useState('');
  const choices = facilities.data ?? [];
  useEffect(() => {
    if (!facilities.data) return;
    const stored = safeSessionStorage.getItem('nestbox-manager-facility');
    const next = facilities.data.find(item => item.id === targetFacility)?.id ?? facilities.data.find(item => item.id === stored)?.id ?? facilities.data[0]?.id ?? '';
    safeSessionStorage.setItem('nestbox-manager-facility', next);
    if (stored !== next) window.dispatchEvent(new Event('nestbox-manager-facility-change'));
    setSelected(next);
  }, [facilities.data, targetFacility]);
  const ready = choices.some(item => item.id === selected) && !facilities.error;
  return (
    <OperationsWorkspace.Provider value="/manager"><InternalPortalLayout key={selected} outletContext={selected}
      label="Quản lý cơ sở"
      navigation={operationsNavigation()}
      pageNavigation={managerPageNavigation()}
      themed
      scopeReady={ready}
      scopeNotice={<section className="manager-card" role="status"><h2>{facilities.loading ? 'Đang tải cơ sở' : facilities.error ? 'Chưa tải được quyền cơ sở' : 'Chưa được cấp quyền cơ sở'}</h2><p>{facilities.loading ? 'Vui lòng chờ trong giây lát.' : facilities.error || 'Liên hệ quản trị viên để được cấp quyền quản lý cơ sở.'}</p>{facilities.error && <button className="button-secondary" onClick={facilities.refresh}>Thử lại</button>}</section>}
      scopeControl={ready ? <select aria-label="Cơ sở đang quản lý" value={selected} onChange={event => {
        safeSessionStorage.setItem('nestbox-manager-facility', event.target.value);
        window.location.assign(pathname === '/manager/catalog/additional-services' ? pathname : '/manager');
      }}>{choices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <span role="status">{facilities.loading ? 'Đang tải cơ sở…' : facilities.error ? <button onClick={facilities.refresh}>Tải lại cơ sở</button> : 'Chưa được cấp quyền cơ sở'}</span>}
    /></OperationsWorkspace.Provider>
  );
}
