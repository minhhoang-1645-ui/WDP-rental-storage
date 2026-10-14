import { InternalPortalLayout } from "../../components/layout/InternalPortalLayout";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { operationPath } from "../../auth/portal-routing";
import { operationsNavigation } from "../../components/manager/operations-navigation";
import { OperationsWorkspace } from '../../components/manager/operations-workspace';

export function ManagerLayout() {
  const { user } = useAuth();
  const location = useLocation();
  if (user?.role === "ADMIN" && location.pathname === "/manager/assignments")
    return <Navigate replace to="/admin" />;
  if (user?.role === "ADMIN")
    return (
      <Navigate
        replace
        to={operationPath(
          user.role,
          location.pathname + location.search + location.hash,
        )}
      />
    );
  return (
    <OperationsWorkspace.Provider value="/manager"><InternalPortalLayout
      label="Quản lý cơ sở"
      navigation={operationsNavigation()}
    /></OperationsWorkspace.Provider>
  );
}
