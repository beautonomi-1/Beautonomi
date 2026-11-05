import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
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
  hideWhenEmpty = false,
  collapsible = false,
  inlineInThread = false,
}: {
  targetType: string;
  targetId: string;
  actionTypes?: string[];
  entityLabel?: string;
  shadowMode?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** When true, render nothing if there are no pending or recent decided actions. */
  hideWhenEmpty?: boolean;
  /** Collapse to a one-line bar until expanded (support ticket detail). */
  collapsible?: boolean;
  /** Inside ticket thread scrollport; expanded body capped to ~40% of thread. */
  inlineInThread?: boolean;
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

  let actions = q.data ?? [];
  if (actionTypes?.length) {
    actions = actions.filter((a) => actionTypes.includes(a.action_type));
  }
  const pending = actions.filter((a) => PENDING_AGENT_STATUSES.has(a.status));
  const decided = actions.filter((a) => !PENDING_AGENT_STATUSES.has(a.status)).slice(0, 3);

  const hasContent = pending.length > 0 || decided.length > 0;
  const [expanded, setExpanded] = useState(() => Boolean(assistId) || pending.length > 0);

  useEffect(() => {
    if (assistId || pending.length > 0) setExpanded(true);
  }, [assistId, pending.length]);

  if (q.isLoading) return hideWhenEmpty ? null : <AdminPageSkeleton rows={3} />;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return null;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  if (!hasContent) {
    if (hideWhenEmpty) return null;
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  if (collapsible) {
    const barLabel =
      pending.length > 0
        ? `${pending.length} AI draft${pending.length === 1 ? "" : "s"} to review`
        : `Recent AI decisions (${decided.length})`;

    return (
      <div className={inlineInThread ? undefined : "shrink-0"} role="region" aria-label="AI suggestions">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm font-medium ${
            pending.length > 0
              ? "border-primary/30 bg-primary/5 text-primary"
              : "border-gray-200 bg-gray-50 text-gray-700"
          }`}
          aria-expanded={expanded}
        >
          <span>{barLabel}</span>
          {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
        </button>
        {expanded ? (
          <div
            className={`admin-scrollbar mt-2 space-y-4 overflow-y-auto pr-1 ${
              inlineInThread ? "max-h-[min(12rem,40vh)]" : "max-h-40"
            }`}
          >
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
                highlightId={assistId}
                onUpdated={() => void q.refetch()}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
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
