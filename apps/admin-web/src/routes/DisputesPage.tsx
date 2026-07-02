import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { formatAdminCurrency } from "@/lib/adminFormatCurrency";
import { AdminListToolbar } from "@/components/admin/AdminListToolbar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { adminToast } from "@/lib/adminToast";

interface DisputeBooking {
  id: string;
  booking_number: string;
  status: string;
  total_amount: number;
  customer: { id: string; full_name: string | null; email: string };
  provider: { id: string; business_name: string };
}

interface Dispute {
  id: string;
  booking_id: string;
  reason: string;
  description: string | null;
  opened_by: string;
  status: "open" | "resolved" | "closed";
  opened_at: string;
  resolution: "refund_full" | "refund_partial" | "deny" | null;
  refund_amount: number | null;
  notes: string | null;
  booking: DisputeBooking;
}

interface DisputeStatistics {
  total: number;
  open: number;
  resolved: number;
  closed: number;
  by_opener: { customer: number; provider: number; admin: number };
  by_resolution: { refund_full: number; refund_partial: number; deny: number };
}

interface DisputesPayload {
  disputes: Dispute[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  statistics: DisputeStatistics;
}

const LIMIT = 50;

const STATUS_BADGE: Record<string, string> = {
  open: "bg-red-100 text-red-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-600",
};

const RESOLUTION_LABEL: Record<string, string> = {
  refund_full: "Full refund",
  refund_partial: "Partial refund",
  deny: "Denied",
};

export function DisputesPage() {
  useAdminDocumentTitle("Disputes");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required for disputes."
  );
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();

  // Server-driven filter state (persisted to URL)
  const statusFilter = sp.get("status") || "all";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const urlSearch = sp.get("q") || "";

  // Local search input — debounced before updating URL
  const [searchInput, setSearchInput] = useState(urlSearch);

  useEffect(() => {
    const t = setTimeout(() => {
      const n = new URLSearchParams(sp);
      if (searchInput.trim()) n.set("q", searchInput.trim());
      else n.delete("q");
      n.set("page", "1");
      setSp(n, { replace: true });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Modal state
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<"refund_full" | "refund_partial" | "deny">("deny");
  const [refundAmount, setRefundAmount] = useState("");
  const [notes, setNotes] = useState("");

  const [closeId, setCloseId] = useState<string | null>(null);

  const queryKey = adminQueryKeys.disputes.list({ statusFilter, page });

  const q = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", String(LIMIT));
      params.set("page", String(page));
      if (urlSearch) params.set("search", urlSearch);
      return adminApi.getJson<DisputesPayload>(
        `/api/admin/disputes?${params.toString()}`,
        { timeoutMs: 60_000 }
      );
    },
    enabled: allowed,
  });

  const disputes = q.data?.disputes ?? [];
  const pag = q.data?.pagination;
  const stats = q.data?.statistics;
  const selected = resolveId ? disputes.find((d) => d.id === resolveId) : null;
  const closeTarget = closeId ? disputes.find((d) => d.id === closeId) : null;

  function updateSp(updates: Record<string, string | null>) {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") n.delete(k);
      else n.set(k, v);
    }
    setSp(n, { replace: true });
  }

  function setPage(next: number) {
    updateSp({ page: next <= 1 ? null : String(next) });
  }

  function setStatusFilter(val: string) {
    updateSp({ status: val === "all" ? null : val, page: null });
  }

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return null;
      const body: Record<string, unknown> = {
        status: "resolved",
        resolution,
        notes: notes || null,
      };
      if (resolution === "refund_full") {
        body.refund_amount = selected.booking?.total_amount ?? null;
      } else if (resolution === "refund_partial") {
        const amount = parseFloat(refundAmount);
        if (!Number.isNaN(amount) && amount > 0) body.refund_amount = amount;
      }
      return adminApi.patchJson<{
        provider_balance_warning?: string | null;
      }>(`/api/admin/disputes/${selected.id}`, body);
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.disputes.all() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
      setResolveId(null);
      setNotes("");
      setRefundAmount("");
      adminToast.success("Dispute resolved");
      if (data && "provider_balance_warning" in data && data.provider_balance_warning) {
        adminToast.warning(data.provider_balance_warning);
      }
    },
    onError: (e: Error) => adminToast.error(`Failed to resolve dispute: ${e.message}`),
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!closeTarget) return;
      return adminApi.patchJson(`/api/admin/disputes/${closeTarget.id}`, {
        status: "closed",
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.disputes.all() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
      setCloseId(null);
      adminToast.success("Dispute closed");
    },
    onError: (e: Error) => adminToast.error(`Failed to close dispute: ${e.message}`),
  });

  if (denied) return denied;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Disputes" description="Booking disputes and resolutions" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }

  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Disputes" />
        <AdminPanel>
          <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
        </AdminPanel>
      </div>
    );
  }

  // Tab counts from server statistics (accurate across all pages)
  const tabCounts = useMemo(
    () => ({
      all: stats?.total ?? 0,
      open: stats?.open ?? 0,
      resolved: stats?.resolved ?? 0,
      closed: stats?.closed ?? 0,
    }),
    [stats]
  );

  const tabs = [
    ["all", "All"],
    ["open", "Open"],
    ["resolved", "Resolved"],
    ["closed", "Closed"],
  ] as const;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Disputes"
        description="Manage booking disputes. Resolving with a refund credits the customer's wallet immediately."
      />

      {/* Statistics banner */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ["Open", stats.open, "text-red-600"],
            ["Resolved", stats.resolved, "text-green-700"],
            ["Closed", stats.closed, "text-gray-600"],
            ["Total", stats.total, "text-gray-900"],
          ] as const).map(([label, value, cls]) => (
            <AdminPanel key={label} className="!p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {label}
              </p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${cls}`}>
                {value}
              </p>
            </AdminPanel>
          ))}
        </div>
      )}

      <AdminPanel>
        <AdminListToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search booking, customer, provider, reason…"
          hasActiveFilters={statusFilter !== "all"}
          onClearFilters={() => setStatusFilter("all")}
          filters={[
            {
              key: "status",
              label: "Status",
              type: "select",
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: "all", label: "All statuses" },
                { value: "open", label: "Open" },
                { value: "resolved", label: "Resolved" },
                { value: "closed", label: "Closed" },
              ],
            },
          ]}
          className="mb-4"
        />

        {/* Tabs — driven by server statistics for accuracy */}
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={adminTabButtonClass(statusFilter === key)}
              onClick={() => setStatusFilter(key)}
            >
              {label}{" "}
              <span className="ml-1 tabular-nums text-xs opacity-70">
                ({tabCounts[key]})
              </span>
            </button>
          ))}
        </div>

        {pag && (
          <p className="mb-3 text-sm text-gray-500">
            Page {pag.page} of {Math.max(1, pag.total_pages)} · {pag.total} total
          </p>
        )}

        {disputes.length === 0 ? (
          <EmptyState title="No disputes" description="Nothing matches these filters." />
        ) : (
          <ul className="space-y-4">
            {disputes.map((d) => (
              <li key={d.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2 text-sm">
                    {/* Status badges */}
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[d.status] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                      </span>
                      <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
                        Opened by {d.opened_by}
                      </span>
                      {d.resolution && (
                        <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
                          {RESOLUTION_LABEL[d.resolution] ?? d.resolution}
                        </span>
                      )}
                    </div>

                    {/* Reason + description */}
                    <p className="font-semibold text-gray-900">{d.reason}</p>
                    {d.description && (
                      <p className="text-gray-600">{d.description}</p>
                    )}

                    {/* Booking info */}
                    <p className="text-gray-600">
                      Booking{" "}
                      <strong>{d.booking?.booking_number}</strong>
                      {" · "}
                      {d.booking?.customer?.full_name || d.booking?.customer?.email}
                      {" · "}
                      {d.booking?.provider?.business_name}
                      {" · "}
                      <span className="font-medium">
                        {formatAdminCurrency(d.booking?.total_amount ?? 0)}
                      </span>
                    </p>

                    {/* Refund recorded */}
                    {d.refund_amount != null && (
                      <p className="text-sm text-gray-700">
                        Refund issued:{" "}
                        <span className="font-semibold text-green-700">
                          {formatAdminCurrency(d.refund_amount)}
                        </span>
                      </p>
                    )}

                    {/* Notes */}
                    {d.notes && (
                      <p className="rounded border border-gray-100 bg-gray-50 p-2 text-xs text-gray-700">
                        Notes: {d.notes}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 flex-wrap items-start gap-2 sm:flex-col">
                    {d.status === "open" && (
                      <button
                        type="button"
                        className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-700"
                        onClick={() => {
                          setResolveId(d.id);
                          setResolution("deny");
                          setRefundAmount("");
                          setNotes("");
                        }}
                      >
                        Resolve
                      </button>
                    )}
                    {d.status !== "closed" && (
                      <button
                        type="button"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        onClick={() => setCloseId(d.id)}
                      >
                        Close
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Pagination */}
        {pag && pag.total_pages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
            <span className="text-sm text-gray-500">
              Page {pag.page} of {pag.total_pages} · {pag.total} total
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                disabled={page >= pag.total_pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </AdminPanel>

      {/* Resolve dispute modal */}
      <AdminModal
        open={!!selected}
        onClose={() => setResolveId(null)}
        title="Resolve dispute"
        description={
          selected
            ? `Booking ${selected.booking?.booking_number ?? ""} — ${selected.reason}`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => setResolveId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={resolveMutation.isPending}
              onClick={() => resolveMutation.mutate()}
            >
              {resolveMutation.isPending ? "Resolving…" : "Confirm resolve"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {selected && (
            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
              <p>
                <span className="font-medium">Customer:</span>{" "}
                {selected.booking?.customer?.full_name ||
                  selected.booking?.customer?.email}
              </p>
              <p>
                <span className="font-medium">Provider:</span>{" "}
                {selected.booking?.provider?.business_name}
              </p>
              <p>
                <span className="font-medium">Booking total:</span>{" "}
                {formatAdminCurrency(selected.booking?.total_amount ?? 0)}
              </p>
            </div>
          )}

          <label className="block text-sm font-medium text-gray-700">
            Resolution
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as typeof resolution)}
              className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
            >
              <option value="deny">Deny — no refund</option>
              <option value="refund_full">Full refund (wallet credit)</option>
              <option value="refund_partial">Partial refund (wallet credit)</option>
            </select>
          </label>

          {resolution === "refund_partial" && (
            <label className="block text-sm font-medium text-gray-700">
              Refund amount (ZAR)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="e.g. 150.00"
                className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
              />
            </label>
          )}

          {(resolution === "refund_full" || resolution === "refund_partial") && (
            <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
              The customer&apos;s wallet will be credited immediately. They can
              apply the balance to their next booking or request a payout.
            </p>
          )}

          <label className="block text-sm font-medium text-gray-700">
            Internal notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add context for the resolution…"
              className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
            />
          </label>

          <AdminMutationAlert errors={[resolveMutation.error]} />
        </div>
      </AdminModal>

      {/* Close dispute confirmation modal */}
      <AdminModal
        open={!!closeTarget}
        onClose={() => setCloseId(null)}
        title="Close dispute"
        description={
          closeTarget
            ? `Close dispute for booking ${closeTarget.booking?.booking_number ?? ""}?`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => setCloseId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={closeMutation.isPending}
              onClick={() => closeMutation.mutate()}
            >
              {closeMutation.isPending ? "Closing…" : "Close dispute"}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Closing marks this dispute as resolved without any moderation action. No
          refund will be issued. This cannot be re-opened.
        </p>
        <AdminMutationAlert errors={[closeMutation.error]} />
      </AdminModal>
    </div>
  );
}
