import { useParams } from "react-router-dom";
import { ManagerDetailPage } from "./ManagerDetailPage";
export function ManagerInquiryDetailPage() {
  const { id = "" } = useParams();
  return <ManagerDetailPage key={id} resource="inquiries" />;
}
