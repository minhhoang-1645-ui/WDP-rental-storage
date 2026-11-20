import { useParams } from "react-router-dom";
import { ManagerDetailPage } from "./ManagerDetailPage";
export function ManagerReservationDetailPage() {
  const { id = "" } = useParams();
  return <ManagerDetailPage key={id} resource="reservations" />;
}
