import { InternalPortalLayout } from '../../components/layout/InternalPortalLayout';
import { staffNavigation } from '../../components/manager/operations-navigation';
import { OperationsWorkspace } from '../../components/manager/operations-workspace';
export function StaffLayout() {
  return <OperationsWorkspace.Provider value="/staff"><InternalPortalLayout label="Nhân viên vận hành" navigation={staffNavigation()} /></OperationsWorkspace.Provider>;
}
