import { ADMIN_SECTION_SUPPORT } from "@beautonomi/admin-access";
import { DomainAiQueuePage } from "@/components/agent-assist/DomainAiQueuePage";
import { useAgentShadowMode } from "@/hooks/useAgentShadowMode";
import { agentActionDeepLink } from "@/lib/agentAssistCopy";
import type { AgentActionRow } from "@/lib/agentActionTypes";

const SUPPORT_ACTIONS = ["support.reply", "support.assign", "support.resolve"];

export function SupportAiDraftsPage() {
  const { shadowMode } = useAgentShadowMode();
  return (
    <DomainAiQueuePage
      section={ADMIN_SECTION_SUPPORT}
      title="Support AI drafts"
      description="Review suggested replies and routing before anything is sent to customers."
      actionTypes={SUPPORT_ACTIONS}
      shadowMode={shadowMode}
      entityLink={(a) => agentActionDeepLink(a.action_type, a.target_id, a.id)}
      entityLabel={(a) => {
        const p = a.proposed_payload ?? {};
        const ticketNumber = typeof p.ticketNumber === "string" ? p.ticketNumber : a.target_id.slice(0, 8);
        return `Ticket ${ticketNumber}`;
      }}
    />
  );
}
