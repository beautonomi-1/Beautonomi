import { ADMIN_SECTION_USERS_TRUST } from "@beautonomi/admin-access";
import { DomainAiQueuePage } from "@/components/agent-assist/DomainAiQueuePage";
import { useAgentShadowMode } from "@/hooks/useAgentShadowMode";
import { agentActionDeepLink } from "@/lib/agentAssistCopy";

const TRUST_ACTIONS = [
  "fraud.briefing",
  "dispute.briefing",
  "report.briefing",
  "moderation.briefing",
  "moderation.hide",
  "trust.open_case",
];

export function TrustAiQueuePage() {
  const { shadowMode } = useAgentShadowMode();
  return (
    <DomainAiQueuePage
      section={ADMIN_SECTION_USERS_TRUST}
      title="Trust and safety AI queue"
      description="Review briefings and takedown proposals before they affect users or content."
      actionTypes={TRUST_ACTIONS}
      shadowMode={shadowMode}
      entityLink={(a) => agentActionDeepLink(a.action_type, a.target_id, a.id)}
      entityLabel={(a) => a.target_type.replace(/_/g, " ")}
    />
  );
}
