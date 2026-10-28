import { useAuth } from '../../auth/auth-context';
import { isStaffWorkflow, isManagerResource } from '../../utils/operation-access';
import { useParams } from "react-router-dom";
import { ManagerDetailPage } from "./ManagerDetailPage";
import { resources } from "../../components/manager/portal-data";
import { WorkspaceNotFound } from "../../components/layout/WorkspaceNotFound";
export function ManagerResourceDetailPage() {
  const { resource = "", id = "" } = useParams();
  const { user } = useAuth();
  if ((user?.role === 'MANAGER' && !isManagerResource(resource)) || (user?.role === 'STAFF' && !isStaffWorkflow(resource))) return <WorkspaceNotFound />;
  if (!Object.hasOwn(resources, resource)) return <WorkspaceNotFound />;
  return <ManagerDetailPage key={resource + id} resource={resource} />;
}
