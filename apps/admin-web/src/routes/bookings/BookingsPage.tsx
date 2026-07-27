import { useDeferredValue, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminListToolbar } from "@/components/admin/AdminListToolbar";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { downloadAdminBlob } from "@/lib/adminCsvDownload";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";

interface BookingListRow {
  id: string;
  booking_number?: string;
  customer_id?: string;
  provider_id?: string;
  status?: string;
  booking_source?: string;
  scheduled_at?: string;
  total_amount?: number;
  total_paid?: number;
  wallet_amount?: number;
  gift_card_amount?: number;
  outstanding_balance?: number;
  payment_status?: string;
  currency?: string;
  services?: { offering_name?: string; name?: string }[];
}

type BookingsListStats = {
  total: number;
  pending: number;
  confirmed: number;
  in_progress: number;
  completed: number;
  cancelled: number;
  no_show: number;
  completed_gmv: number;
};

type BookingsPayload =
  | BookingListRow[]
  | { bookings: BookingListRow[]; total?: number; stats?: BookingsListStats };

const LIMIT = 50;

export function BookingsPage() {
  useAdminDocumentTitle("Bookings");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required for bookings."
  );
  const qc = useQueryClient();

  const [sp, setSp] = useSearchParams();
  const page = Math.max(0, parseInt(sp.get("page") || "0", 10) || 0);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<string>("all");
  const deferredSearch = useDeferredValue(searchQuery);

  const filters = { statusFilter, dateFilter, search: deferredSearch.trim() };
  const q = useQuery({
    queryKey: adminQueryKeys.bookings.list({ ...filters, page }),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (dateFilter) params.set("date", dateFilter);
      if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
      params.set("limit", String(LIMIT));
      params.set("page", String(page));
      const qs = params.toString();
      return adminApi.getJson<BookingsPayload>(`/api/admin/bookings${qs ? `?${qs}` : ""}`, {
        timeoutMs: 60_000,
      });
    },
    enabled: allowed,
  });

  const bulkMutation = useMutation({
    mutationFn: async (payload: { booking_ids: string[]; action: "cancel" | "complete" }) => {
      await adminApi.postJson("/api/admin/bookings/bulk", payload);
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.bookings.all() });
      setSelectedIds(new Set());
      const count = vars.booking_ids.length;
      const label = vars.action === "cancel" ? "cancelled" : "completed";
      adminToast.success(`${count} booking${count !== 1 ? "s" : ""} ${label}`);
    },
    onError: (e: Error) => adminToast.error(`Bulk action failed: ${e.message}`),
  });

  const allRows = useMemo<BookingListRow[]>(() => {
    const d = q.data;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    return d.bookings ?? [];
  }, [q.data]);

  const total = useMemo(() => {
    const d = q.data;
    if (!d || Array.isArray(d)) return allRows.length;
    return d.total ?? allRows.length;
  }, [q.data, allRows.length]);

  const totalPages = Math.ceil(total / LIMIT);

  function setPage(next: number) {
    const n = new URLSearchParams(sp);
    if (next === 0) n.delete("page");
    else n.set("page", String(next));
    setSp(n, { replace: true });
    setSelectedIds(new Set());
  }

  const filtered = useMemo(() => {
    const sq = deferredSearch.toLowerCase();
    if (!sq) return allRows;
    return allRows.filter((b) => (b.booking_number ?? "").toLowerCase().includes(sq));
  }, [allRows, deferredSearch]);

  const grouped = useMemo(() => {
    return {
      all: filtered,
      pending: filtered.filter((b) => b.status === "pending"),
      confirmed: filtered.filter((b) => b.status === "confirmed"),
      in_progress: filtered.filter((b) => b.status === "in_progress"),
      completed: filtered.filter((b) => b.status === "completed"),
      cancelled: filtered.filter((b) => b.status === "cancelled"),
      no_show: filtered.filter((b) => b.status === "no_show"),
    };
  }, [filtered]);

  const visible = grouped[tab as keyof typeof grouped] ?? grouped.all;

  const apiStats = useMemo(() => {
    const d = q.data;
    if (!d || Array.isArray(d)) return null;
    return d.stats ?? null;
  }, [q.data]);

  const stats = useMemo(() => {
    if (apiStats) {
      return {
        total: apiStats.total,
        pending: apiStats.pending,
        confirmed: apiStats.confirmed,
        in_progress: apiStats.in_progress,
        completed: apiStats.completed,
        cancelled: apiStats.cancelled,
        no_show: apiStats.no_show,
        revenue: apiStats.completed_gmv,
      };
    }
    const bookings = allRows;
    return {
      total: bookings.length,
      pending: bookings.filter((b) => b.status === "pending").length,
      confirmed: bookings.filter((b) => b.status === "confirmed").length,
      in_progress: bookings.filter((b) => b.status === "in_progress").length,
      completed: bookings.filter((b) => b.status === "completed").length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
      no_show: bookings.filter((b) => b.status === "no_show").length,
      revenue: bookings
        .filter((b) => b.status === "completed")
        .reduce((s, b) => s + (b.total_amount || 0), 0),
    };
  }, [apiStats, allRows]);

  async function exportCsv() {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (dateFilter) params.set("scheduled_date", dateFilter);
    const qs = params.toString();
    await downloadAdminBlob(
      `/api/admin/export/bookings${qs ? `?${qs}` : ""}`,
      `bookings-export-${new Date().toISOString().split("T")[0]}.csv`
    );
  }

  function toggleSelect(id: string, on: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(on: boolean) {
    if (on) setSelectedIds(new Set(visible.map((b) => b.id)));
    else setSelectedIds(new Set());
  }

  function runBulk(action: "cancel" | "complete") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Perform ${action} on ${ids.length} booking(s)?`)) return;
    bulkMutation.mutate({ booking_ids: ids, action });
  }

  if (denied) return denied;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Bookings" description="Monitor platform bookings" />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }

  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Bookings" description="Monitor platform bookings" />
        <AdminPanel>
          <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
        </AdminPanel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Bookings oversight"
        description="Monitor all platform bookings in your tenant scope"
        actions={
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900"
            onClick={() => void exportCsv().catch(() => adminToast.error("Export failed — please try again"))}
          >
            Export CSV
          </button>
        }
      />

      <AdminPanel>
        <div className="flex flex-wrap gap-4">
          {(
            [
              ["Total", stats.total],
              ["Pending", stats.pending],
              ["Confirmed", stats.confirmed],
              ["In progress", stats.in_progress],
              ["Completed", stats.completed],
              ["Cancelled", stats.cancelled],
              ["No show", stats.no_show],
              ["Booked GMV (completed)", `R ${stats.revenue.toLocaleString()}`],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="min-w-[100px]">
              <div className="text-xs text-gray-500">{label}</div>
              <div className="text-lg font-semibold text-gray-900">{value}</div>
            </div>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminListToolbar
          searchValue={searchQuery}
          onSearchChange={(v) => { setSearchQuery(v); setPage(0); }}
          searchPlaceholder="Search by booking number…"
          hasActiveFilters={statusFilter !== "all" || !!dateFilter}
          onClearFilters={() => { setStatusFilter("all"); setDateFilter(""); setPage(0); }}
          filters={[
            {
              key: "status",
              label: "Status",
              type: "select",
              value: statusFilter,
              onChange: (v) => { setStatusFilter(v); setPage(0); },
              options: [
                { value: "all", label: "All statuses" },
                { value: "pending", label: "Pending" },
                { value: "confirmed", label: "Confirmed" },
                { value: "in_progress", label: "In progress" },
                { value: "completed", label: "Completed" },
                { value: "cancelled", label: "Cancelled" },
                { value: "no_show", label: "No show" },
              ],
            },
            {
              key: "date",
              label: "Scheduled date",
              type: "date",
              value: dateFilter,
              onChange: (v) => { setDateFilter(v); setPage(0); },
            },
          ]}
          className="mb-4"
        />

        <AdminBulkActionBar
          selectedCount={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
        >
          <button
            type="button"
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            disabled={bulkMutation.isPending}
            onClick={() => runBulk("complete")}
          >
            Mark complete
          </button>
          <button
            type="button"
            className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            disabled={bulkMutation.isPending}
            onClick={() => runBulk("cancel")}
          >
            Cancel
          </button>
          <span className="text-xs text-gray-500">Use Export CSV for the current filtered set.</span>
        </AdminBulkActionBar>

        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["pending", "Pending"],
              ["confirmed", "Confirmed"],
              ["in_progress", "In progress"],
              ["completed", "Completed"],
              ["cancelled", "Cancelled"],
              ["no_show", "No show"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" className={adminTabButtonClass(tab === key)} onClick={() => setTab(key)}>
              {label} ({(grouped[key as keyof typeof grouped] ?? []).length})
            </button>
          ))}
        </div>

        <div className="mb-2 flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={visible.length > 0 && visible.every((b) => selectedIds.has(b.id))}
            onChange={(e) => toggleSelectAll(e.target.checked)}
          />
          <span>Select all on this tab</span>
        </div>

        <p className="mb-3 text-xs text-gray-500">
          Page {page + 1}{totalPages > 1 ? ` of ${totalPages}` : ""} · {total} total
        </p>
        {visible.length === 0 ? (
          <EmptyState title="No bookings" description="No bookings match these filters." />
        ) : (
          <ul className="space-y-3">
            {visible.map((b) => (
              <li key={b.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedIds.has(b.id)}
                    onChange={(e) => toggleSelect(b.id, e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase text-gray-700">
                        {b.status ?? "—"}
                      </span>
                      {b.booking_source ? (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium capitalize text-indigo-800">
                          {b.booking_source.replace(/_/g, " ")}
                        </span>
                      ) : null}
                      {b.payment_status ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            b.payment_status === "paid"
                              ? "bg-green-100 text-green-800"
                              : b.payment_status === "partially_paid"
                                ? "bg-yellow-100 text-yellow-800"
                                : b.payment_status === "refunded"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-orange-100 text-orange-800"
                          }`}
                        >
                          {b.payment_status === "paid"
                            ? "Paid"
                            : b.payment_status === "partially_paid"
                              ? "Partially paid"
                              : b.payment_status === "refunded"
                                ? "Refunded"
                                : "Payment pending"}
                        </span>
                      ) : null}
                      <span className="font-semibold text-gray-900">#{b.booking_number ?? b.id.slice(0, 8)}</span>
                    </div>
                    <div className="mt-2 grid gap-1 text-sm text-gray-600 sm:grid-cols-2">
                      <span>Customer: {b.customer_id?.slice(0, 8) ?? "—"}…</span>
                      <span>Provider: {b.provider_id?.slice(0, 8) ?? "—"}…</span>
                      <span>
                        {b.scheduled_at
                          ? new Date(b.scheduled_at).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "—"}
                      </span>
                      <span>
                        <span className="font-medium">{b.currency} {b.total_amount?.toFixed(2) ?? "—"}</span>
                        {(b.total_paid ?? 0) > 0 && (
                          <span className="ml-1 text-xs text-gray-500">
                            Paid: {b.currency} {(b.total_paid ?? 0).toFixed(2)}
                          </span>
                        )}
                        {(b.wallet_amount ?? 0) > 0 && (
                          <span className="ml-1 text-xs text-purple-700">
                            +Wallet: {b.currency} {(b.wallet_amount ?? 0).toFixed(2)}
                          </span>
                        )}
                        {(b.gift_card_amount ?? 0) > 0 && (
                          <span className="ml-1 text-xs text-teal-700">
                            +Gift card: {b.currency} {(b.gift_card_amount ?? 0).toFixed(2)}
                          </span>
                        )}
                      </span>
                      {(b.outstanding_balance ?? 0) > 0 ? (
                        <span className="font-medium text-red-600">
                          Outstanding: {b.currency} {(b.outstanding_balance ?? 0).toFixed(2)}
                        </span>
                      ) : null}
                    </div>
                    {b.services && b.services.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {b.services.slice(0, 4).map((s, i) => (
                          <span key={i} className="rounded bg-pink-50 px-2 py-0.5 text-xs text-pink-800">
                            {s.offering_name || s.name || "Service"}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Link
                    to={adminSpaTo(`/admin/bookings/${encodeURIComponent(b.id)}`)}
                    className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    View
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
            <span className="text-sm text-gray-500">Page {page + 1} of {totalPages}</span>
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
    </div>
  );
}
