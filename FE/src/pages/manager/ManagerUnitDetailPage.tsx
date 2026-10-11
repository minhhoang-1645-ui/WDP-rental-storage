import { useParams } from "react-router-dom";
import { ManagerDetailPage } from "./ManagerDetailPage";
export function ManagerUnitDetailPage() {
  const { id = "" } = useParams();
  return <ManagerDetailPage key={id} resource="units" />;
}
