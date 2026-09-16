import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import type { AgentActionRow } from "@/lib/agentActionTypes";
import { PENDING_AGENT_STATUSES } from "@/lib/agentActionTypes";
import { AgentAssistCard } from "./AgentAssistCard";

export function AgentAssistPanel({
  targetType,
  targetId,
  actionTypes,
  entityLabel,
  shadowMode,
  emptyTitle = "No AI suggestions for this item",
  emptyDescription = "When an agent drafts something for review, it will appear here.",
}: {
  targetType: string;
  targetId: string;
  actionTypes?: string[];
  entityLabel?: string;
  shadowMode?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [searchParams] = useSearchParams();
  const assistId = searchParams.get("assist");

  const q = useQuery({
    queryKey: adminQueryKeys.agentActionsForTarget(targetType, targetId),
    queryFn: async () => {
      const qs = new URLSearchParams({
        target_type: targetType,
        target_id: targetId,
        include_decided: "true",
      });
      const rows = await adminApi.getJson<AgentActionRow[]>(`/api/admin/agent-actions?${qs.toString()}`);
      return rows ?? [];
    },
  });

  useEffect(() => {
    if (!assistId || q.isLoading) return;
    const el = document.getElementById(`agent-assist-${assistId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [assistId, q.isLoading, q.data]);

  if (q.isLoading) return <AdminPageSkeleton rows={3} />;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return null;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  let actions = q.data ?? [];
  if (actionTypes?.length) {
    actions = actions.filter((a) => actionTypes.includes(a.action_type));
  }
  const pending = actions.filter((a) => PENDING_AGENT_STATUSES.has(a.status));
  const decided = actions.filter((a) => !PENDING_AGENT_STATUSES.has(a.status)).slice(0, 3);

  if (!pending.length && !decided.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-4" role="region" aria-label="AI suggestions">
      {pending.map((action) => (
        <AgentAssistCard
          key={action.id}
          action={action}
          entityLabel={entityLabel}
          shadowMode={shadowMode}
          highlightId={assistId}
          onUpdated={() => void q.refetch()}
        />
      ))}
      {decided.map((action) => (
        <AgentAssistCard
          key={action.id}
          action={action}
          entityLabel={entityLabel}
          shadowMode={shadowMode}
          compact
          onUpdated={() => void q.refetch()}
        />
      ))}
    </div>
  );
}
