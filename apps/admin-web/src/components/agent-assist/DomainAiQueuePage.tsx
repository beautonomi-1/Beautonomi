import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type { AdminSection } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminTabButtonClass } from "@/lib/adminUi";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminConfirmAction } from "@/hooks/useAdminConfirmAction";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminDataList, type AdminListColumn } from "@/components/admin/AdminDataList";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { getAgentAssistPresentation } from "@/lib/agentAssistCopy";
import { formatAdminRelativeTime } from "@/lib/formatAdminDateTime";
import type { AgentActionRow } from "@/lib/agentActionTypes";
import { humanStatusLabel } from "@/lib/agentAssistCopy";
import { PENDING_AGENT_STATUSES } from "@/lib/agentActionTypes";
import { adminToast } from "@/lib/adminToast";
import { AgentAssistCard } from "./AgentAssistCard";
import { PROVIDER_OPS_BULK_AGENT_ACTION_MAX } from "@/lib/providerOpsBulkLimits";

function buildActionTypeQuery(actionTypes?: string[]): string {
  if (!actionTypes?.length) return "";
  const qs = new URLSearchParams();
  actionTypes.forEach((t) => qs.append("action_type", t));
  return `&${qs.toString()}`;
}

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { requestConfirm, ConfirmDialog } = useAdminConfirmAction();

  const actionTypeQuery = useMemo(() => buildActionTypeQuery(actionTypes), [actionTypes]);

  const assistQ = useQuery({
    queryKey: adminQueryKeys.agentActionById(assistId ?? ""),
    enabled: Boolean(assistId) && !denied,
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("include_decided", "true");
      actionTypes?.forEach((t) => qs.append("action_type", t));
      const rows = await adminApi.getJson<AgentActionRow[]>(`/api/admin/agent-actions?${qs.toString()}`);
      return (rows ?? []).find((r) => r.id === assistId) ?? null;
    },
  });

  const q = useQuery({
    queryKey: [...adminQueryKeys.agentActionsQueue(section, statusFilter), actionTypeQuery],
    enabled: !denied,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (statusFilter === "all") {
        qs.set("include_decided", "true");
      } else if (statusFilter !== "pending") {
        qs.set("status", statusFilter);
      }
      actionTypes?.forEach((t) => qs.append("action_type", t));
      const rows = await adminApi.getJson<AgentActionRow[]>(`/api/admin/agent-actions?${qs.toString()}`);
      return rows ?? [];
    },
  });

  useEffect(() => {
    if (!assistId) return;
    const el = document.getElementById(`agent-assist-${assistId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [assistId, q.data, assistQ.data?.id]);

  const bulkMut = useMutation({
    mutationFn: (body: { ids: string[]; decision: "approve" | "reject"; execute?: boolean }) =>
      adminApi.postJson<{ results: { id: string; status: string; executed?: boolean; error?: string }[] }>(
        "/api/admin/agent-actions/bulk",
        body,
      ),
    onSuccess: (data) => {
      const errors = data.results.filter((r) => r.status === "error").length;
      const pending = data.results.filter((r) => r.status === "approval_pending").length;
      const executed = data.results.filter((r) => r.executed).length;
      const approvedOnly = data.results.filter(
        (r) => r.status === "approved" && !r.executed,
      ).length;
      if (executed > 0) {
        adminToast.success(`Sent ${executed} suggestion${executed === 1 ? "" : "s"}`);
      }
      if (approvedOnly > 0) {
        adminToast.success(`Approved ${approvedOnly} — ready to send individually if needed`);
      }
      if (pending > 0) {
        adminToast.info(
          `${pending} payout or policy review${pending === 1 ? "" : "s"} still need a second approver (maker-checker). Bulk approve does not edit draft text.`,
        );
      }
      if (errors > 0) {
        adminToast.warning(`${errors} suggestion${errors === 1 ? "" : "s"} could not be processed`);
      }
      if (executed === 0 && approvedOnly === 0 && pending === 0 && errors === 0) {
        adminToast.success("Bulk decision recorded");
      }
      setSelectedIds(new Set());
      void q.refetch();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const runBulk = (decision: "approve" | "reject", execute?: boolean) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (ids.length > PROVIDER_OPS_BULK_AGENT_ACTION_MAX) {
      adminToast.error(`Select at most ${PROVIDER_OPS_BULK_AGENT_ACTION_MAX} suggestions for bulk actions`);
      return;
    }
    const label = execute ? "Approve and send" : decision === "approve" ? "Approve" : "Reject";
    requestConfirm({
      title: `${label} ${ids.length} suggestion(s)?`,
      consequence:
        execute && !shadowMode
          ? "Approved items will be sent where policy allows. Payout reviews may still require a second approver."
          : shadowMode && execute
            ? "Shadow mode is on — approvals will be recorded but sending may still be blocked."
            : decision === "reject"
              ? "Rejected suggestions will not be sent. Bulk actions do not edit draft text."
              : "Bulk approve records decisions only — no draft edits. Payout reviews may stay pending until a second approver.",
      confirmLabel: label,
      onConfirm: async () => {
        bulkMut.mutate({ ids, decision, execute });
      },
    });
  };

  if (denied) return denied;

  const showPendingCards = statusFilter === "pending";
  const pendingRows = (q.data ?? []).filter((r) => PENDING_AGENT_STATUSES.has(r.status));
  const assistRow =
    assistId && assistQ.data && !pendingRows.some((r) => r.id === assistId) ? assistQ.data : null;

  const columns: AdminListColumn<AgentActionRow>[] = [
    {
      id: "title",
      header: "Suggestion",
      cell: (row) => {
        const pres = getAgentAssistPresentation(row.action_type);
        return <span className="font-medium text-gray-900">{pres.title}</span>;
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
    {
      id: "open",
      header: "",
      cell: (row) => (
        <Link to={adminSpaTo(entityLink(row))} className="text-xs font-medium text-primary hover:underline">
          Open record
        </Link>
      ),
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
              setSelectedIds(new Set());
              setSearchParams(next);
            }}
          >
            {tab === "pending" ? "Awaiting review" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {assistId && assistRow ? (
        <AdminPanel title="Review linked suggestion">
          <AgentAssistCard
            action={assistRow}
            entityLabel={entityLabel(assistRow)}
            shadowMode={shadowMode}
            highlightId={assistId}
            onUpdated={() => {
              void q.refetch();
              void assistQ.refetch();
            }}
          />
        </AdminPanel>
      ) : null}

      {showPendingCards && selectedIds.size > 0 && (
        <AdminBulkActionBar
          selectedCount={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          hint={`Bulk limit ${PROVIDER_OPS_BULK_AGENT_ACTION_MAX} · no draft edits in bulk · payout reviews may stay pending after one approve`}
        >
          <button
            type="button"
            disabled={bulkMut.isPending}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
            onClick={() => runBulk("approve", false)}
          >
            Approve
          </button>
          {!shadowMode ? (
            <button
              type="button"
              disabled={bulkMut.isPending}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              onClick={() => runBulk("approve", true)}
            >
              Approve and send
            </button>
          ) : null}
          <button
            type="button"
            disabled={bulkMut.isPending}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
            onClick={() => runBulk("reject")}
          >
            Reject
          </button>
        </AdminBulkActionBar>
      )}

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
        ) : showPendingCards ? (
          <div className="space-y-4">
            {pendingRows.map((row) => {
              const checked = selectedIds.has(row.id);
              return (
                <div key={row.id} className="flex gap-3">
                  <input
                    type="checkbox"
                    className="mt-6 h-4 w-4 shrink-0 rounded border-gray-300"
                    checked={checked}
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.id)) {
                          next.delete(row.id);
                          return next;
                        }
                        if (next.size >= PROVIDER_OPS_BULK_AGENT_ACTION_MAX) {
                          adminToast.warning(
                            `Bulk actions are limited to ${PROVIDER_OPS_BULK_AGENT_ACTION_MAX} suggestions at a time`,
                          );
                          return prev;
                        }
                        next.add(row.id);
                        return next;
                      });
                    }}
                    aria-label={`Select ${getAgentAssistPresentation(row.action_type).title}`}
                  />
                  <div className="min-w-0 flex-1">
                    <AgentAssistCard
                      action={row}
                      entityLabel={entityLabel(row)}
                      shadowMode={shadowMode}
                      highlightId={assistId}
                      compact
                      onUpdated={() => void q.refetch()}
                    />
                    <Link
                      to={adminSpaTo(entityLink(row))}
                      className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                    >
                      Open record →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <AdminDataList columns={columns} rows={q.data} rowKey={(r) => r.id} />
        )}
      </AdminPanel>
      <ConfirmDialog />
    </div>
  );
}
