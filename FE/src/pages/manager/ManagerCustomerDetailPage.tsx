import { useParams } from "react-router-dom";
import { ManagerDetailPage } from "./ManagerDetailPage";
export function ManagerCustomerDetailPage() {
  const { id = "" } = useParams();
  return <ManagerDetailPage key={id} resource="customers" />;
}
