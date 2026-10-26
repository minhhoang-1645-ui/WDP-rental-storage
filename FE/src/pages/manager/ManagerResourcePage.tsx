import { useAuth } from '../../auth/auth-context';
import { isStaffWorkflow } from '../../utils/operation-access';
import { useParams } from "react-router-dom";
import { ManagerListPage } from "./ManagerListPage";
import { resources } from "../../components/manager/portal-data";
import { WorkspaceNotFound } from "../../components/layout/WorkspaceNotFound";
export function ManagerResourcePage() {
  const { resource = "" } = useParams();
  const { user } = useAuth();
  if ((user?.role === 'MANAGER' && isStaffWorkflow(resource)) || (user?.role === 'STAFF' && !isStaffWorkflow(resource))) return <WorkspaceNotFound />;
  if (!Object.hasOwn(resources, resource)) return <WorkspaceNotFound />;
  return <ManagerListPage key={resource} resource={resource} />;
}
