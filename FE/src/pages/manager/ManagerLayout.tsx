import { InternalPortalLayout } from "../../components/layout/InternalPortalLayout";
import { operationsNavigation, managerPageNavigation } from "../../components/manager/operations-navigation";
import { OperationsWorkspace } from '../../components/manager/operations-workspace';
import '../../styles/workspace-theme.css';
import '../../styles/staff-workspace.css';
import '../../styles/manager-workspace.css';

export function ManagerLayout() {
  return (
    <OperationsWorkspace.Provider value="/manager"><InternalPortalLayout
      label="Quản lý cơ sở"
      navigation={operationsNavigation()}
      pageNavigation={managerPageNavigation()}
      themed
    /></OperationsWorkspace.Provider>
  );
}
