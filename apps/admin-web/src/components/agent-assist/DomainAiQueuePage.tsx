import { useEffect } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type { AdminSection } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminTabButtonClass } from "@/lib/adminUi";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminDataList, type AdminListColumn } from "@/components/admin/AdminDataList";
import { getAgentAssistPresentation } from "@/lib/agentAssistCopy";
import { formatAdminRelativeTime } from "@/lib/formatAdminDateTime";
import type { AgentActionRow } from "@/lib/agentActionTypes";
import { humanStatusLabel } from "@/lib/agentAssistCopy";
import { AgentAssistCard } from "./AgentAssistCard";

export function DomainAiQueuePage({
  section,
  title,
  description,
  actionTypes,
  entityLink,
  entityLabel,
  shadowMode,
  permissionMessage,
}: {
  section: AdminSection;
  title: string;
  description: string;
  actionTypes?: string[];
  entityLink: (action: AgentActionRow) => string;
  entityLabel: (action: AgentActionRow) => string;
  shadowMode?: boolean;
  permissionMessage?: string;
}) {
  const { denied } = useAdminSectionPage(
    section,
    permissionMessage ?? "You don't have permission to view AI suggestions in this section.",
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") ?? "pending";
  const assistId = searchParams.get("assist");

  const assistQ = useQuery({
    queryKey: adminQueryKeys.agentActionById(assistId ?? ""),
    enabled: Boolean(assistId) && !denied,
    queryFn: async () => {
      const rows = await adminApi.getJson<AgentActionRow[]>(
        `/api/admin/agent-actions?include_decided=true`,
      );
      return (rows ?? []).find((r) => r.id === assistId) ?? null;
    },
  });

  useEffect(() => {
    if (!assistId) return;
    const el = document.getElementById(`agent-assist-${assistId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [assistId, assistQ.data?.id]);

  const q = useQuery({
    queryKey: adminQueryKeys.agentActionsQueue(section, statusFilter),
    enabled: !denied,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (statusFilter === "all") {
        qs.set("include_decided", "true");
      } else if (statusFilter !== "pending") {
        qs.set("status", statusFilter);
      }
      const rows = await adminApi.getJson<AgentActionRow[]>(`/api/admin/agent-actions?${qs.toString()}`);
      let list = rows ?? [];
      if (actionTypes?.length) list = list.filter((a) => actionTypes.includes(a.action_type));
      return list;
    },
  });

  if (denied) return denied;

  const columns: AdminListColumn<AgentActionRow>[] = [
    {
      id: "title",
      header: "Suggestion",
      cell: (row) => {
        const pres = getAgentAssistPresentation(row.action_type);
        return (
          <Link to={adminSpaTo(entityLink(row))} className="font-medium text-gray-900 hover:underline">
            {pres.title}
          </Link>
        );
      },
    },
    {
      id: "entity",
      header: "Item",
      cell: (row) => <span className="text-gray-700">{entityLabel(row)}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => {
        const s = humanStatusLabel(row.status, shadowMode);
        return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
      },
    },
    {
      id: "when",
      header: "Proposed",
      cell: (row) => <span title={row.created_at}>{formatAdminRelativeTime(row.created_at)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader title={title} description={description} />
      <div className="flex flex-wrap gap-2">
        {(["pending", "approved", "executed", "all"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={adminTabButtonClass(statusFilter === tab)}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              if (tab === "pending") next.delete("status");
              else next.set("status", tab);
              setSearchParams(next);
            }}
          >
            {tab === "pending" ? "Awaiting review" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      {assistId && assistQ.data ? (
        <AdminPanel title="Review selected suggestion">
          <AgentAssistCard
            action={assistQ.data}
            entityLabel={entityLabel(assistQ.data)}
            shadowMode={shadowMode}
            highlightId={assistId}
            onUpdated={() => {
              void q.refetch();
              void assistQ.refetch();
            }}
          />
        </AdminPanel>
      ) : null}
      <AdminPanel>
        {q.isLoading ? (
          <AdminPageSkeleton rows={5} />
        ) : q.error ? (
          <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState
            title="No AI drafts right now"
            description="When agents propose actions in this domain, they will appear here for your review."
          />
        ) : (
          <AdminDataList columns={columns} rows={q.data} rowKey={(r) => r.id} />
        )}
      </AdminPanel>
    </div>
  );
}
