import { useSearchParams } from "react-router";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AgentAssistPanel } from "./AgentAssistPanel";
import { useAgentShadowMode } from "@/hooks/useAgentShadowMode";

/** Shows pending AI suggestions when URL contains ?highlight=<entityId> (and optional ?assist=<actionId>). */
export function AgentAssistEntitySection({
  targetType,
  actionTypes,
  entityLabel,
  title = "AI suggestion",
}: {
  targetType: string;
  actionTypes?: string[];
  entityLabel?: string;
  title?: string;
}) {
  const [sp] = useSearchParams();
  const highlight = sp.get("highlight");
  const { shadowMode } = useAgentShadowMode();
  if (!highlight) return null;

  return (
    <AdminPanel title={title}>
      <AgentAssistPanel
        targetType={targetType}
        targetId={highlight}
        actionTypes={actionTypes}
        entityLabel={entityLabel}
        shadowMode={shadowMode}
      />
    </AdminPanel>
  );
}
