import { useParams } from "react-router-dom";
import { ManagerListPage } from "./ManagerListPage";
import { resources } from "../../components/manager/portal-data";
import { WorkspaceNotFound } from "../../components/layout/WorkspaceNotFound";
export function ManagerResourcePage() {
  const { resource = "" } = useParams();
  if (!Object.hasOwn(resources, resource)) return <WorkspaceNotFound />;
  return <ManagerListPage key={resource} resource={resource} />;
}
