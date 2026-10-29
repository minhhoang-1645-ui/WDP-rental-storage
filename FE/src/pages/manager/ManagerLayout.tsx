import { InternalPortalLayout } from "../../components/layout/InternalPortalLayout";
import { operationsNavigation, managerPageNavigation } from "../../components/manager/operations-navigation";
import { OperationsWorkspace } from '../../components/manager/operations-workspace';

export function ManagerLayout() {
  return (
    <OperationsWorkspace.Provider value="/manager"><InternalPortalLayout
      label="Quản lý cơ sở"
      navigation={operationsNavigation()}
      pageNavigation={managerPageNavigation()}
    /></OperationsWorkspace.Provider>
  );
}
