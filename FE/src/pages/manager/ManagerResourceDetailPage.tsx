import { useAuth } from '../../auth/auth-context';
import { canAccessManagerReview } from '../../utils/manager-review-access';
import { useParams } from "react-router-dom";
import { ManagerDetailPage } from "./ManagerDetailPage";
import { resources } from "../../components/manager/portal-data";
import { WorkspaceNotFound } from "../../components/layout/WorkspaceNotFound";
import { ManagerUnitDetailPage } from "./ManagerUnitDetailPage";
export function ManagerResourceDetailPage() {
  const { resource = "", id = "" } = useParams();
  const { user } = useAuth();
  if (!canAccessManagerReview(user?.role ?? '', resource)) return <WorkspaceNotFound />;
  if (!Object.hasOwn(resources, resource)) return <WorkspaceNotFound />;
  if (resource === 'units' && user?.role === 'FACILITY_MANAGER') return <ManagerUnitDetailPage key={id} />;
  return <ManagerDetailPage key={resource + id} resource={resource} />;
}
