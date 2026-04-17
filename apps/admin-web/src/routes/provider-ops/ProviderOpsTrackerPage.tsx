import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass, adminToolbarButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminSpaTo } from "@/lib/adminSpaPath";

const PAGE_SIZE = 50;
const STATUS_TABS = [
  { key: "all", label: "All" }, { key: "active", label: "Active" },
  { key: "slowing", label: "Slowing" }, { key: "stalled", label: "Stalled" },
  { key: "dropped_off", label: "Dropped Off" }, { key: "completed", label: "Completed" },
] as const;

const STALL_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-700", slowing: "bg-amber-100 text-amber-700",
  stalled: "bg-red-100 text-red-700", dropped_off: "bg-red-200 text-red-800",
  completed: "bg-teal-100 text-teal-700",
};

interface TrackerRow {
  user_id: string; email: string; full_name: string; phone: string | null;
  current_step: number; current_step_name: string; last_activity: string;
  stall_status: string; has_provider: boolean; admin_assisted: boolean;
  draft_summary?: { business_name?: string | null; team_size?: string | null; has_address?: boolean; has_thumbnail?: boolean; has_services?: boolean; category_count?: number; selected_plan_id?: string | null };
}
interface TrackerStats { in_progress: number; stalled: number; dropped_off: number; active_in_wizard: number; by_step: Record<number, number>; pending_approval: number }

export function ProviderOpsTrackerPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") || "all";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const search = sp.get("search") || "";
  const [searchInput, setSearchInput] = useState(search);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const qk = useMemo(() => adminQueryKeys.providerOps.tracker(`s=${status}|p=${page}|q=${search}`), [status, page, search]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (status !== "all") p.set("status", status);
      p.set("page", String(page)); p.set("limit", String(PAGE_SIZE));
      if (search) p.set("search", search);
      return adminApi.getJson<{ data: TrackerRow[]; meta: { total: number; has_more: boolean } }>(`/api/admin/provider-ops/tracker?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const statsQ = useQuery({
    queryKey: adminQueryKeys.providerOps.trackerStats(),
    queryFn: () => adminApi.getJson<TrackerStats>("/api/admin/provider-ops/tracker/stats", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  const rows = q.data?.data ?? [];
  const total = q.data?.meta?.total ?? 0;
  const hasMore = q.data?.meta?.has_more ?? false;
  const stats = statsQ.data;

  function setStatus(next: string) {
    const n = new URLSearchParams(sp);
    if (next === "all") n.delete("status"); else n.set("status", next);
    n.delete("page"); setSp(n, { replace: true });
  }
  function commitSearch() {
    const n = new URLSearchParams(sp);
    if (searchInput.trim()) n.set("search", searchInput.trim()); else n.delete("search");
    n.delete("page"); setSp(n, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) return <div className="space-y-6"><AdminPageHeader title="Onboarding Tracker" /><AdminPanel><AdminPageSkeleton rows={6} /></AdminPanel></div>;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Onboarding Tracker" description="Every provider signup, every step, every stall" />

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="In Progress" value={stats.in_progress} highlight={false} />
          <StatCard label="Active" value={stats.active_in_wizard} highlight={false} />
          <StatCard label="Stalled" value={stats.stalled} highlight={stats.stalled > 0} />
          <StatCard label="Dropped Off" value={stats.dropped_off} highlight={stats.dropped_off > 0} />
          <StatCard label="Pending Approval" value={stats.pending_approval} highlight={false} />
        </div>
      )}

      {stats && Object.keys(stats.by_step).length > 0 && (
        <AdminPanel>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Currently At Each Step</h3>
          <div className="flex flex-wrap gap-1">
            {Object.entries(stats.by_step).sort(([a], [b]) => Number(a) - Number(b)).map(([step, count]) => (
              <div key={step} className="flex min-w-[48px] flex-col items-center rounded border bg-gray-50 px-2 py-1 text-center">
                <span className="text-lg font-bold text-gray-800">{count}</span>
                <span className="text-[9px] text-gray-400">Step {step}</span>
              </div>
            ))}
          </div>
        </AdminPanel>
      )}

      <div className="flex items-center gap-3">
        <input type="text" placeholder="Search by name, email, phone..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && commitSearch()} className="w-full max-w-sm rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm placeholder:text-gray-400" />
        <button type="button" className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white" onClick={commitSearch}>Search</button>
      </div>

      <AdminPanel>
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((t) => <button key={t.key} type="button" className={adminTabButtonClass(status === t.key)} onClick={() => setStatus(t.key)}>{t.label}</button>)}
        </div>
      </AdminPanel>

      {rows.length === 0 ? <EmptyState title="No signups found" /> : (
        <div className="space-y-2">
          {rows.map((row) => {
            const name = row.full_name || row.draft_summary?.business_name || row.email || "Unknown";
            const badge = STALL_BADGE[row.stall_status] || "bg-gray-100 text-gray-600";
            const isExpanded = expandedRow === row.user_id;
            return (
              <div key={row.user_id} className="cursor-pointer rounded-2xl border border-gray-200/90 bg-white p-4 shadow-sm ring-1 ring-gray-950/[0.03] transition-shadow hover:shadow-md md:p-6" onClick={() => setExpandedRow(isExpanded ? null : row.user_id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">{row.current_step}</div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 truncate">{name}</span>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${badge}`}>{row.stall_status.replace(/_/g, " ")}</span>
                        {row.admin_assisted && <span className="inline-block rounded-full border border-blue-200 px-2 py-0.5 text-[10px] font-medium text-blue-600">Admin Assisted</span>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span>Step {row.current_step}: {row.current_step_name}</span>
                        <span>{getRelTime(row.last_activity)}</span>
                        {row.email && <span className="truncate">{row.email}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="hidden gap-0.5 md:flex">
                      {Array.from({ length: 14 }, (_, i) => i + 1).map((step) => (
                        <div key={step} className={`h-3 w-3 rounded-full ${step < row.current_step ? "bg-green-400" : step === row.current_step ? "bg-blue-500 ring-2 ring-blue-200" : "bg-gray-200"}`} />
                      ))}
                    </div>
                    <Link to={adminSpaTo(`/admin/provider-ops/tracker/${row.user_id}`)} onClick={(e) => e.stopPropagation()} className="ml-2 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">View</Link>
                  </div>
                </div>
                {isExpanded && row.draft_summary && (
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs sm:grid-cols-4">
                    <DraftField label="Business" value={row.draft_summary.business_name} />
                    <DraftField label="Team Size" value={row.draft_summary.team_size} />
                    <DraftField label="Address" value={row.draft_summary.has_address ? "✓ Provided" : "✗ Missing"} ok={row.draft_summary.has_address} />
                    <DraftField label="Services" value={row.draft_summary.has_services ? "✓ Added" : "✗ None"} ok={row.draft_summary.has_services} />
                    <DraftField label="Categories" value={row.draft_summary.category_count ? `${row.draft_summary.category_count} selected` : "✗ None"} ok={(row.draft_summary.category_count || 0) > 0} />
                    <DraftField label="Plan" value={row.draft_summary.selected_plan_id ? "✓ Selected" : "✗ Not selected"} ok={!!row.draft_summary.selected_plan_id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}</p>
          <div className="flex gap-2">
            <button type="button" className={adminToolbarButtonClass(page <= 1)} disabled={page <= 1} onClick={() => { const n = new URLSearchParams(sp); n.set("page", String(page - 1)); setSp(n, { replace: true }); }}>Previous</button>
            <button type="button" className={adminToolbarButtonClass(!hasMore)} disabled={!hasMore} onClick={() => { const n = new URLSearchParams(sp); n.set("page", String(page + 1)); setSp(n, { replace: true }); }}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight: boolean }) {
  return (
    <AdminPanel className={`!p-3 ${highlight && value > 0 ? "!border-red-200 !bg-red-50/50" : ""}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${highlight && value > 0 ? "text-red-600" : "text-gray-900"}`}>{value}</p>
    </AdminPanel>
  );
}

function DraftField({ label, value, ok }: { label: string; value: string | null | undefined; ok?: boolean }) {
  return <div><span className="text-gray-400">{label}</span><p className={`font-medium ${ok === false ? "text-red-500" : ok === true ? "text-green-600" : "text-gray-700"}`}>{value || "—"}</p></div>;
}

function getRelTime(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
