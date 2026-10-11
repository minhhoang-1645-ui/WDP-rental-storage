import { useParams } from "react-router-dom";
import { ManagerDetailPage } from "./ManagerDetailPage";
import { resources } from "../../components/manager/portal-data";
import { WorkspaceNotFound } from "../../components/layout/WorkspaceNotFound";
export function ManagerResourceDetailPage() {
  const { resource = "", id = "" } = useParams();
  if (!Object.hasOwn(resources, resource)) return <WorkspaceNotFound />;
  return <ManagerDetailPage key={resource + id} resource={resource} />;
}
