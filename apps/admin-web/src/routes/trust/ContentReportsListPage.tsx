import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminToast } from "@/lib/adminToast";
import { TrustReportsTabNav } from "@/routes/trust/TrustReportsTabNav";

type ContentReportsPayload = {
  data: Record<string, unknown>[];
  has_more: boolean;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  resolved: "bg-green-100 text-green-800",
  dismissed: "bg-gray-100 text-gray-600",
};

const TARGET_TYPES = [
  "all",
  "explore_post",
  "explore_comment",
  "message",
  "review",
  "product_review",
] as const;

export function ContentReportsListPage() {
  useAdminDocumentTitle("Content Reports");
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") || "all";
  const targetType = sp.get("target_type") || "all";
  const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);
  const qk = useMemo(
    () => adminQueryKeys.contentReports(`s=${status}|t=${targetType}|o=${offset}`),
    [status, targetType, offset]
  );

  const [actionId, setActionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"resolve" | "dismiss" | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("limit", "50");
      p.set("offset", String(offset));
      if (status !== "all") p.set("status", status);
      if (targetType !== "all") p.set("target_type", targetType);
      return adminApi.getJson<ContentReportsPayload>(`/api/admin/content-reports?${p}`, {
        timeoutMs: 60_000,
      });
    },
  });

  const updateReport = useMutation({
    mutationFn: async ({
      id,
      newStatus,
      notes,
    }: {
      id: string;
      newStatus: string;
      notes: string;
    }) => {
      return adminApi.patchJson(`/api/admin/content-reports/${id}`, {
        status: newStatus,
        resolution_notes: notes.trim() || undefined,
      });
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: qk });
      setActionId(null);
      setActionType(null);
      setResolutionNotes("");
      adminToast.success(vars.newStatus === "resolved" ? "Report resolved" : "Report dismissed");
    },
    onError: (e: Error) => adminToast.error(`Failed to update report: ${e.message}`),
  });

  const rows = q.data?.data ?? [];
  const hasMore = q.data?.has_more ?? false;

  function setFilter(key: "status" | "target_type", next: string) {
    const n = new URLSearchParams(sp);
    if (next === "all") n.delete(key);
    else n.set(key, next);
    n.delete("offset");
    setSp(n, { replace: true });
  }

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Content reports" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const statusTabs = ["all", "pending", "resolved", "dismissed"] as const;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Content reports"
        description="Review user-submitted reports on posts, comments, messages, and reviews."
      />
      <AdminPanel>
        <TrustReportsTabNav />
      </AdminPanel>
      <AdminPanel>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Status</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {statusTabs.map((t) => (
            <button
              key={t}
              type="button"
              className={adminTabButtonClass(status === t)}
              onClick={() => setFilter("status", t)}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Target type</p>
        <div className="flex flex-wrap gap-2">
          {TARGET_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={adminTabButtonClass(targetType === t)}
              onClick={() => setFilter("target_type", t)}
            >
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No content reports" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Target</AdminTh>
              <AdminTh>Reason</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Reporter</AdminTh>
              <AdminTh>Details</AdminTh>
              <AdminTh>Date</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              const id = String(row.id ?? "");
              const rep = row.reporter as { full_name?: string; email?: string } | null;
              const isPending = String(row.status ?? "") === "pending";
              const isExpanded = expandedId === id;
              const statusStr = String(row.status ?? "pending");
              const badgeClass = STATUS_BADGE[statusStr] ?? "bg-gray-100 text-gray-600";

              return (
                <Fragment key={id}>
                  <tr
                    className={`cursor-pointer hover:bg-gray-50 ${isExpanded ? "bg-gray-50" : ""}`}
                    onClick={() => setExpandedId(isExpanded ? null : id)}
                  >
                    <AdminTd className="text-xs">
                      <span className="font-medium">{String(row.target_type ?? "")}</span>
                      <br />
                      <span className="font-mono text-gray-500">{String(row.target_id ?? "").slice(0, 8)}…</span>
                    </AdminTd>
                    <AdminTd>{String(row.reason ?? "")}</AdminTd>
                    <AdminTd>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
                        {statusStr}
                      </span>
                    </AdminTd>
                    <AdminTd className="text-xs">{String(rep?.full_name ?? rep?.email ?? "")}</AdminTd>
                    <AdminTd className="max-w-xs truncate text-xs">{String(row.details ?? "—")}</AdminTd>
                    <AdminTd className="whitespace-nowrap text-xs text-gray-500">
                      {row.created_at ? new Date(String(row.created_at)).toLocaleDateString() : ""}
                    </AdminTd>
                    <AdminTd>
                      {isPending && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionId(id);
                              setActionType("resolve");
                              setResolutionNotes("");
                            }}
                          >
                            Resolve
                          </button>
                          <button
                            type="button"
                            className="rounded bg-gray-500 px-2 py-1 text-xs text-white hover:bg-gray-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionId(id);
                              setActionType("dismiss");
                              setResolutionNotes("");
                            }}
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </AdminTd>
                  </tr>
                  {isExpanded && (
                    <tr key={`${id}-detail`}>
                      <td colSpan={7} className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="mb-1 font-medium text-gray-700">Target ID</p>
                            <p className="font-mono text-xs text-gray-600">{String(row.target_id ?? "")}</p>
                            {Boolean(row.details) ? (
                              <div className="mt-3">
                                <p className="mb-1 font-medium text-gray-700">Details</p>
                                <p className="text-gray-600">{String(row.details)}</p>
                              </div>
                            ) : null}
                          </div>
                          <div>
                            {Boolean(row.resolution_notes) ? (
                              <div>
                                <p className="mb-1 font-medium text-gray-700">Resolution notes</p>
                                <p className="text-xs text-gray-600">{String(row.resolution_notes)}</p>
                              </div>
                            ) : null}
                            {Boolean(row.resolved_at) ? (
                              <p className="mt-2 text-xs text-gray-400">
                                Resolved: {new Date(String(row.resolved_at)).toLocaleString()}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}

      {actionId && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold text-gray-900">
              {actionType === "resolve" ? "Resolve Report" : "Dismiss Report"}
            </h3>
            <p className="mb-4 text-sm text-gray-500">
              {actionType === "resolve"
                ? "Mark this content report as resolved."
                : "Dismiss this content report."}
            </p>
            <label className="mb-1 block text-sm font-medium text-gray-700">Resolution notes (optional)</label>
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder={actionType === "resolve" ? "Describe the action taken..." : "Reason for dismissal..."}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => {
                  setActionId(null);
                  setActionType(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`rounded-lg px-4 py-2 text-sm text-white ${
                  actionType === "resolve" ? "bg-green-600 hover:bg-green-700" : "bg-gray-600 hover:bg-gray-700"
                } disabled:opacity-50`}
                disabled={updateReport.isPending}
                onClick={() => {
                  updateReport.mutate({
                    id: actionId,
                    newStatus: actionType === "resolve" ? "resolved" : "dismissed",
                    notes: resolutionNotes,
                  });
                }}
              >
                {updateReport.isPending ? "Saving..." : actionType === "resolve" ? "Resolve" : "Dismiss"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
          disabled={offset <= 0}
          onClick={() => {
            const n = new URLSearchParams(sp);
            n.set("offset", String(Math.max(0, offset - 50)));
            setSp(n, { replace: true });
          }}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
          disabled={!hasMore}
          onClick={() => {
            const n = new URLSearchParams(sp);
            n.set("offset", String(offset + 50));
            setSp(n, { replace: true });
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
