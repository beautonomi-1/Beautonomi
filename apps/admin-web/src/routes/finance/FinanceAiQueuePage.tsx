import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { DomainAiQueuePage } from "@/components/agent-assist/DomainAiQueuePage";
import { useAgentShadowMode } from "@/hooks/useAgentShadowMode";
import { formatAdminCurrency } from "@/lib/adminFormatCurrency";
import { agentActionDeepLink } from "@/lib/agentAssistCopy";

const FINANCE_ACTIONS = ["payout.review", "reconciliation.investigate", "refund.briefing", "membership.dunning"];

export function FinanceAiQueuePage() {
  const { shadowMode } = useAgentShadowMode();
  return (
    <DomainAiQueuePage
      section={ADMIN_SECTION_FINANCE}
      title="Finance AI queue"
      description="Review payout recommendations and internal briefings before they are applied."
      actionTypes={FINANCE_ACTIONS}
      shadowMode={shadowMode}
      entityLink={(a) => agentActionDeepLink(a.action_type, a.target_id, a.id)}
      entityLabel={(a) => {
        const p = a.proposed_payload ?? {};
        if (typeof p.amount === "number") return formatAdminCurrency(p.amount, String(p.currency ?? "ZAR"));
        return a.target_type.replace(/_/g, " ");
      }}
    />
  );
}
