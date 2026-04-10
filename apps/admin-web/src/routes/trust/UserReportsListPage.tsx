import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
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

type UserReportsPayload = {
  data: Record<string, unknown>[];
  has_more: boolean;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  resolved: "bg-green-100 text-green-800",
  dismissed: "bg-gray-100 text-gray-600",
};

export function UserReportsListPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required."
  );
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") || "all";
  const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);
  const qk = useMemo(() => adminQueryKeys.userReports(`s=${status}|o=${offset}`), [status, offset]);

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
      return adminApi.getJson<UserReportsPayload>(`/api/admin/user-reports?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const updateReport = useMutation({
    mutationFn: async ({ id, newStatus, notes }: { id: string; newStatus: string; notes: string }) => {
      return adminApi.patchJson(`/api/admin/user-reports/${id}`, {
        status: newStatus,
        resolution_notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
      setActionId(null);
      setActionType(null);
      setResolutionNotes("");
    },
  });

  const rows = q.data?.data ?? [];
  const hasMore = q.data?.has_more ?? false;

  function setStatus(next: string) {
    const n = new URLSearchParams(sp);
    if (next === "all") n.delete("status");
    else n.set("status", next);
    n.delete("offset");
    setSp(n, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="User reports" />
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

  const tabs = ["all", "pending", "resolved", "dismissed"] as const;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="User reports" description="Manage user-submitted reports. Resolve or dismiss with notes." />
      <AdminPanel>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              className={adminTabButtonClass(status === t)}
              onClick={() => setStatus(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No reports" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Type</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Reporter</AdminTh>
              <AdminTh>Reported</AdminTh>
              <AdminTh>Description</AdminTh>
              <AdminTh>Date</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              const id = String(row.id ?? "");
              const rep = row.reporter as { full_name?: string; email?: string } | null;
              const reported = row.reported as { full_name?: string; email?: string } | null;
              const isPending = String(row.status ?? "") === "pending";
              const isExpanded = expandedId === id;
              const statusStr = String(row.status ?? "pending");
              const badgeClass = STATUS_BADGE[statusStr] ?? "bg-gray-100 text-gray-600";

              return (
                <>
                  <tr
                    key={id}
                    className={`cursor-pointer hover:bg-gray-50 ${isExpanded ? "bg-gray-50" : ""}`}
                    onClick={() => setExpandedId(isExpanded ? null : id)}
                  >
                    <AdminTd>{String(row.report_type ?? "")}</AdminTd>
                    <AdminTd>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
                        {statusStr}
                      </span>
                    </AdminTd>
                    <AdminTd className="text-xs">{String(rep?.full_name ?? rep?.email ?? "")}</AdminTd>
                    <AdminTd className="text-xs">{String(reported?.full_name ?? reported?.email ?? "")}</AdminTd>
                    <AdminTd className="max-w-xs truncate text-xs">{String(row.description ?? "")}</AdminTd>
                    <AdminTd className="text-xs text-gray-500 whitespace-nowrap">
                      {row.created_at ? new Date(String(row.created_at)).toLocaleDateString() : ""}
                    </AdminTd>
                    <AdminTd>
                      {isPending && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                            onClick={(e) => { e.stopPropagation(); setActionId(id); setActionType("resolve"); setResolutionNotes(""); }}
                          >
                            Resolve
                          </button>
                          <button
                            type="button"
                            className="rounded bg-gray-500 px-2 py-1 text-xs text-white hover:bg-gray-600"
                            onClick={(e) => { e.stopPropagation(); setActionId(id); setActionType("dismiss"); setResolutionNotes(""); }}
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </AdminTd>
                  </tr>
                  {isExpanded && (
                    <tr key={`${id}-detail`}>
                      <td colSpan={7} className="bg-gray-50 px-4 py-3 border-t border-gray-100">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="font-medium text-gray-700 mb-1">Full description</p>
                            <p className="text-gray-600">{String(row.description ?? "No description")}</p>
                          </div>
                          <div>
                            {Boolean(row.booking_id) ? (
                              <p className="text-xs text-gray-500 mb-1">
                                Booking: <span className="font-mono">{String(row.booking_id)}</span>
                              </p>
                            ) : null}
                            {Boolean(row.resolution_notes) ? (
                              <div className="mt-2">
                                <p className="font-medium text-gray-700 mb-1">Resolution notes</p>
                                <p className="text-gray-600 text-xs">{String(row.resolution_notes)}</p>
                              </div>
                            ) : null}
                            {Boolean(row.resolved_at) ? (
                              <p className="text-xs text-gray-400 mt-1">
                                Resolved: {new Date(String(row.resolved_at)).toLocaleString()}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}

      {/* Action dialog */}
      {actionId && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {actionType === "resolve" ? "Resolve Report" : "Dismiss Report"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {actionType === "resolve"
                ? "Mark this report as resolved. Add notes about what action was taken."
                : "Dismiss this report. Add notes about why it was dismissed."}
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Resolution notes {actionType === "resolve" ? "(recommended)" : "(optional)"}
            </label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[80px]"
              placeholder={actionType === "resolve" ? "Describe the action taken..." : "Reason for dismissal..."}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
            {updateReport.error && (
              <p className="mt-2 text-sm text-red-600">
                {(updateReport.error as Error).message || "Failed to update report"}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => { setActionId(null); setActionType(null); }}
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
