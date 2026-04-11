import { useDeferredValue, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";

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

const LIMIT = 50;

export function DisputesPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required for disputes."
  );
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const page = Math.max(0, parseInt(sp.get("page") || "0", 10) || 0);

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<string>("all");
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<"refund_full" | "refund_partial" | "deny">("deny");
  const [refundAmount, setRefundAmount] = useState("");
  const [notes, setNotes] = useState("");
  const deferredSearch = useDeferredValue(searchQuery);

  const q = useQuery({
    queryKey: adminQueryKeys.disputes.list({ statusFilter, page }),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", String(LIMIT));
      params.set("offset", String(page * LIMIT));
      const qs = params.toString();
      return adminApi.getJson<{ disputes: Dispute[]; total?: number }>(`/api/admin/disputes${qs ? `?${qs}` : ""}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const disputes = q.data?.disputes ?? [];
  const total = q.data?.total ?? disputes.length;
  const totalPages = Math.ceil(total / LIMIT);

  function setPage(next: number) {
    const n = new URLSearchParams(sp);
    if (next === 0) n.delete("page");
    else n.set("page", String(next));
    setSp(n, { replace: true });
  }

  const filtered = useMemo(() => {
    const sq = deferredSearch.toLowerCase();
    if (!sq) return disputes;
    return disputes.filter(
      (d) =>
        (d.booking?.booking_number ?? "").toLowerCase().includes(sq) ||
        (d.booking?.customer?.full_name ?? "").toLowerCase().includes(sq) ||
        (d.booking?.customer?.email ?? "").toLowerCase().includes(sq) ||
        (d.booking?.provider?.business_name ?? "").toLowerCase().includes(sq) ||
        (d.reason ?? "").toLowerCase().includes(sq)
    );
  }, [disputes, deferredSearch]);

  const grouped = useMemo(
    () => ({
      all: filtered,
      open: filtered.filter((d) => d.status === "open"),
      resolved: filtered.filter((d) => d.status === "resolved"),
      closed: filtered.filter((d) => d.status === "closed"),
    }),
    [filtered]
  );

  const visible = grouped[tab as keyof typeof grouped] ?? grouped.all;
  const selected = resolveId ? disputes.find((d) => d.id === resolveId) : null;

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const body: Record<string, unknown> = {
        status: "resolved",
        resolution,
        notes: notes || null,
      };
      if (resolution === "refund_full" && selected.booking?.total_amount != null) {
        body.refund_amount = selected.booking.total_amount;
      } else if (resolution === "refund_partial") {
        const amount = parseFloat(refundAmount);
        if (!Number.isNaN(amount)) body.refund_amount = amount;
      }
      await adminApi.patchJson(`/api/admin/disputes/${selected.id}`, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.disputes.all() });
      setResolveId(null);
      setNotes("");
      setRefundAmount("");
    },
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

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Disputes" description="Manage booking disputes (moderation workflow)" />

      <AdminPanel>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            placeholder="Search booking, customer, provider, reason…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">All (API filter)</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["open", "Open"],
              ["resolved", "Resolved"],
              ["closed", "Closed"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" className={adminTabButtonClass(tab === key)} onClick={() => setTab(key)}>
              {label} ({(grouped[key as keyof typeof grouped] ?? []).length})
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState title="No disputes" description="Nothing matches these filters." />
        ) : (
          <ul className="space-y-4">
            {visible.map((d) => (
              <li key={d.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2 text-sm">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">{d.status}</span>
                      <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-600">by {d.opened_by}</span>
                      {d.resolution ? (
                        <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-600">{d.resolution}</span>
                      ) : null}
                    </div>
                    <p className="font-semibold text-gray-900">{d.reason}</p>
                    {d.description ? <p className="text-gray-600">{d.description}</p> : null}
                    <p className="text-gray-600">
                      Booking <strong>{d.booking?.booking_number}</strong> · {d.booking?.customer?.full_name || d.booking?.customer?.email} ·{" "}
                      {d.booking?.provider?.business_name} · ${d.booking?.total_amount?.toFixed(2)}
                    </p>
                    {d.notes ? (
                      <p className="rounded border border-gray-100 bg-gray-50 p-2 text-xs text-gray-700">Notes: {d.notes}</p>
                    ) : null}
                  </div>
                  {d.status === "open" ? (
                    <button
                      type="button"
                      className="h-fit shrink-0 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white"
                      onClick={() => {
                        setResolveId(d.id);
                        setResolution("deny");
                        setRefundAmount("");
                        setNotes("");
                      }}
                    >
                      Resolve
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
            <span className="text-sm text-gray-500">Page {page + 1} of {totalPages} · {total} total</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                disabled={page <= 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </AdminPanel>

      <AdminModal
        open={!!selected}
        onClose={() => setResolveId(null)}
        title="Resolve dispute"
        description={selected ? `Booking ${selected.booking?.booking_number ?? ""}` : undefined}
        footer={
          <>
            <button type="button" className="rounded border border-gray-300 px-3 py-2 text-sm" onClick={() => setResolveId(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={resolveMutation.isPending}
              onClick={() => resolveMutation.mutate()}
            >
              Submit
            </button>
          </>
        }
      >
        <label className="block text-sm">
          Resolution
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as typeof resolution)}
            className="mt-1 w-full rounded border border-gray-300 p-2"
          >
            <option value="deny">Deny</option>
            <option value="refund_full">Full refund</option>
            <option value="refund_partial">Partial refund</option>
          </select>
        </label>
        {resolution === "refund_partial" ? (
          <label className="mt-3 block text-sm">
            Refund amount
            <input
              type="number"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 p-2"
            />
          </label>
        ) : null}
        <label className="mt-3 block text-sm">
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="mt-1 w-full rounded border border-gray-300 p-2" />
        </label>
        <AdminMutationAlert errors={[resolveMutation.error]} />
      </AdminModal>
    </div>
  );
}
