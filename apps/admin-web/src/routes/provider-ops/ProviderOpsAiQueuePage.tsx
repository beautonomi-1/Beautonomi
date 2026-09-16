import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { DomainAiQueuePage } from "@/components/agent-assist/DomainAiQueuePage";
import { useAgentShadowMode } from "@/hooks/useAgentShadowMode";
import { agentActionDeepLink } from "@/lib/agentAssistCopy";

const PROVIDER_ACTIONS = ["provider.outreach", "provider.digest", "catalog.review"];

export function ProviderOpsAiQueuePage() {
  const { shadowMode } = useAgentShadowMode();
  return (
    <DomainAiQueuePage
      section={ADMIN_SECTION_PROVIDER_OPS}
      title="Provider operations AI queue"
      description="Review outreach messages and catalog feedback before they are sent to providers."
      actionTypes={PROVIDER_ACTIONS}
      shadowMode={shadowMode}
      entityLink={(a) => agentActionDeepLink(a.action_type, a.target_id, a.id)}
      entityLabel={(a) => {
        const p = a.proposed_payload ?? {};
        if (typeof p.providerName === "string") return p.providerName;
        return "Provider";
      }}
    />
  );
}
