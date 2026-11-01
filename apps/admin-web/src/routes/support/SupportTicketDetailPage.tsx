import { useLocation, useParams } from "react-router";
import { SupportTicketDetailView } from "@/routes/support/SupportTicketDetailView";

type TicketNavState = { queueTicketIds?: string[] };

export function SupportTicketDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const location = useLocation();
  const queueTicketIds = (location.state as TicketNavState | null)?.queueTicketIds ?? null;
  return <SupportTicketDetailView id={id} variant="page" queueTicketIds={queueTicketIds} />;
}
