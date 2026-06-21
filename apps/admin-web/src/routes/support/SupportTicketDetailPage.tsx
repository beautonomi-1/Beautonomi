import { useParams } from "react-router-dom";
import { SupportTicketDetailView } from "@/routes/support/SupportTicketDetailView";

export function SupportTicketDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  return <SupportTicketDetailView id={id} variant="page" />;
}
