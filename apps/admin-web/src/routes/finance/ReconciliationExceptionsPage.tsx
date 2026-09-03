import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
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
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminToast } from "@/lib/adminToast";
import { cn } from "@/lib/cn";
import { useAdminSession } from "@/providers/AdminSessionProvider";

type ExceptionRow = {
  id: string;
  status: string;
  source: string;
  amount?: number | null;
  currency?: string | null;
  psp?: string | null;
  external_id?: string | null;
  internal_id?: string | null;
  mismatch_reason?: string | null;
  assigned_to?: string | null;
  assigned_to_user?: { full_name?: string | null; email?: string | null } | null;
  created_at: string;
  resolution_note?: string | null;
};

export function ReconciliationExceptionsPage() {
  useAdminDocumentTitle("Reconciliation exceptions");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  const { bootstrap } = useAdminSession();
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const [source, setSource] = useState("");
  const [assigned, setAssigned] = useState("");
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolution, setResolution] = useState("matched");
  const [note, setNote] = useState("");

  const query = useQuery({
    queryKey: adminQueryKeys.reconciliationExceptions(status, source, assigned),
    enabled: allowed,
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (status) params.set("status", status);
      if (source) params.set("source", source);
      if (assigned) params.set("assigned_to", assigned);
      return adminApi.getJson<{ exceptions: ExceptionRow[]; total: number }>(
        `/api/admin/reconciliation-exceptions?${params}`,
        { timeoutMs: 30_000 },
      );
    },
  });

  const assignMut = useMutation({
    mutationFn: (id: string) =>
      adminApi.postJson(`/api/admin/reconciliation-exceptions/${id}/assign`, { assigned_to: null }),
    onSuccess: () => {
      adminToast.success("Unassigned");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.reconciliationExceptions(status, source, assigned) });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const assignMeMut = useMutation({
    mutationFn: async (id: string) => {
      const userId = bootstrap?.userId;
      if (!userId) throw new Error("Could not resolve current admin user");
      return adminApi.postJson(`/api/admin/reconciliation-exceptions/${id}/assign`, { assigned_to: userId });
    },
    onSuccess: () => {
      adminToast.success("Assigned to you");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.reconciliationExceptions(status, source, assigned) });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const resolveMut = useMutation({
    mutationFn: () => {
      if (!resolveId) throw new Error("No exception selected");
      return adminApi.postJson(`/api/admin/reconciliation-exceptions/${resolveId}/resolve`, {
        resolution,
        note: note.trim() || undefined,
      });
    },
    onSuccess: () => {
      adminToast.success("Exception resolved");
      setResolveId(null);
      setNote("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.reconciliationExceptions(status, source, assigned) });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (denied) return denied;

  const rows = query.data?.exceptions ?? [];
  const authFailed = isAdminApiAuthFailure(query.error);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Reconciliation exceptions"
        description="Open mismatches from ledger vs PSP. Assign a maker, then a different admin resolves (matched, written off, or escalated)."
      />
      <AdminPanel>
        <div className="mb-4 flex flex-wrap gap-2">
          <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Open</option>
            <option value="matched">Matched</option>
            <option value="written_off">Written off</option>
            <option value="escalated">Escalated</option>
            <option value="">All</option>
          </select>
          <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            <option value="ledger">Ledger</option>
            <option value="psp">PSP</option>
            <option value="bank">Bank</option>
          </select>
          <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={assigned} onChange={(e) => setAssigned(e.target.value)}>
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
          <button type="button" className={adminToolbarButtonClass()} onClick={() => void query.refetch()}>
            Refresh
          </button>
        </div>
        {query.isLoading ? (
          <AdminPageSkeleton rows={3} />
        ) : authFailed ? (
          <AdminRetryBlock message={query.error instanceof Error ? query.error.message : "Failed to load"} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No exceptions" description="Ledger capture and the reconcile cron raise rows here when something needs a human." />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <AdminTh>Created</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Reason</AdminTh>
              <AdminTh>Amount</AdminTh>
              <AdminTh>Refs</AdminTh>
              <AdminTh>Assignee</AdminTh>
              <AdminTh>Actions</AdminTh>
            </AdminTableHead>
            <AdminTableBody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <AdminTd className="text-xs text-gray-600">{new Date(row.created_at).toLocaleString()}</AdminTd>
                  <AdminTd>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", row.status === "open" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700")}>
                      {row.status}
                    </span>
                  </AdminTd>
                  <AdminTd className="max-w-xs truncate text-xs" title={row.mismatch_reason ?? undefined}>
                    {row.mismatch_reason ?? "—"}
                  </AdminTd>
                  <AdminTd className="text-xs">
                    {row.amount != null ? `${row.currency ?? ""} ${Number(row.amount).toFixed(2)}` : "—"}
                  </AdminTd>
                  <AdminTd className="font-mono text-xs">
                    {row.external_id ?? "—"}
                    {row.internal_id ? ` / ${row.internal_id}` : ""}
                  </AdminTd>
                  <AdminTd className="text-xs">{row.assigned_to_user?.full_name || row.assigned_to_user?.email || "—"}</AdminTd>
                  <AdminTd>
                    {row.status === "open" ? (
                      <div className="flex flex-wrap gap-1">
                        <button type="button" className="text-xs text-violet-700 underline" onClick={() => void assignMeMut.mutate(row.id)}>
                          Assign me
                        </button>
                        {row.assigned_to ? (
                          <button type="button" className="text-xs text-gray-600 underline" onClick={() => void assignMut.mutate(row.id)}>
                            Unassign
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-xs text-emerald-700 underline"
                          onClick={() => {
                            setResolveId(row.id);
                            setNote("");
                          }}
                        >
                          Resolve
                        </button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      {resolveId ? (
        <AdminPanel>
          <h3 className="mb-3 text-sm font-semibold">Resolve exception</h3>
          <p className="mb-3 text-xs text-gray-600">Maker and checker must be different admins. Assign first if you will check.</p>
          <div className="flex flex-wrap gap-2">
            <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={resolution} onChange={(e) => setResolution(e.target.value)}>
              <option value="matched">Matched</option>
              <option value="written_off">Written off</option>
              <option value="escalated">Escalated</option>
            </select>
            <input
              className="min-w-[16rem] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="Resolution note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="button" className={adminToolbarButtonClass()} onClick={() => void resolveMut.mutate()} disabled={resolveMut.isPending}>
              {resolveMut.isPending ? "Saving…" : "Confirm"}
            </button>
            <button type="button" className={adminToolbarButtonClass()} onClick={() => setResolveId(null)}>
              Cancel
            </button>
          </div>
        </AdminPanel>
      ) : null}
    </div>
  );
}
