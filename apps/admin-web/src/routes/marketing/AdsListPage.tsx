import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
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
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";

type AdsOverview = {
  campaigns_by_status: Record<string, number>;
  campaigns_by_model: Record<string, number>;
  events_7d: { impressions: number; clicks: number; books: number };
  events_30d: { impressions: number; clicks: number; books: number };
  prepaid_revenue_30d_zar: number;
  total_spent_in_campaigns_zar: number;
  total_budget_in_campaigns_zar: number;
};

type Campaign = {
  id: string;
  provider_id: string;
  provider_name: string;
  status: string;
  billing_model: string;
  budget: number;
  spent: number;
  bid_cpc: number;
  daily_budget: number | null;
  pack_impressions: number | null;
  duration_days: number | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
};

type CampaignsPayload = { campaigns: Campaign[]; total: number };

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  draft: "bg-gray-100 text-gray-700",
  paused: "bg-amber-100 text-amber-800",
  ended: "bg-slate-100 text-slate-500",
};

const MODEL_LABELS: Record<string, string> = {
  cpc_budget: "CPC Budget",
  impression_pack: "Impression Pack",
  time_based: "Time-Based",
};

function fmt(v: number) {
  return `R ${v.toFixed(2)}`;
}

const LIMIT = 20;

export function AdsListPage() {
  useAdminDocumentTitle("Ads & Campaigns");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_MARKETING_COMMS,
    "Marketing & comms access is required."
  );
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") || "all";
  const search = sp.get("search") || "";
  const page = Math.max(0, parseInt(sp.get("page") || "0", 10) || 0);
  const [searchInput, setSearchInput] = useState(search);
  const [moderateId, setModerateId] = useState<string | null>(null);
  const [moderateAction, setModerateAction] = useState<"paused" | "ended">("paused");
  const [moderateReason, setModerateReason] = useState("");

  const overviewQ = useQuery({
    queryKey: adminQueryKeys.ads.overview(),
    queryFn: () => adminApi.getJson<AdsOverview>("/api/admin/ads/overview", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  const campaignsQ = useQuery({
    queryKey: adminQueryKeys.ads.campaigns(`s=${status}|q=${search}|p=${page}`),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (status !== "all") p.set("status", status);
      if (search.trim()) p.set("search", search.trim());
      p.set("limit", String(LIMIT));
      p.set("offset", String(page * LIMIT));
      return adminApi.getJson<CampaignsPayload>(`/api/admin/ads/campaigns?${p}`, { timeoutMs: 30_000 });
    },
    enabled: allowed,
  });

  const moderateMutation = useMutation({
    mutationFn: (payload: { id: string; status: string; reason?: string }) =>
      adminApi.patchJson(`/api/admin/ads/campaigns/${payload.id}`, {
        status: payload.status,
        reason: payload.reason || undefined,
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.ads.all() });
      setModerateId(null);
      setModerateReason("");
      adminToast.success(
        vars.status === "active" ? "Campaign approved" :
        vars.status === "rejected" ? "Campaign rejected" :
        vars.status === "suspended" ? "Campaign suspended" :
        "Campaign status updated"
      );
    },
    onError: (e: Error) => adminToast.error(`Moderation failed: ${e.message}`),
  });

  const campaigns = campaignsQ.data?.campaigns ?? [];
  const total = campaignsQ.data?.total ?? 0;
  const overview = overviewQ.data;
  const totalPages = Math.ceil(total / LIMIT);
  const selectedCampaign = campaigns.find((c) => c.id === moderateId) ?? null;

  function setStatus(next: string) {
    const n = new URLSearchParams(sp);
    if (next === "all") n.delete("status");
    else n.set("status", next);
    n.delete("page");
    setSp(n, { replace: true });
  }

  function applySearch() {
    const n = new URLSearchParams(sp);
    if (searchInput.trim()) n.set("search", searchInput.trim());
    else n.delete("search");
    n.delete("page");
    setSp(n, { replace: true });
  }

  function setPage(next: number) {
    const n = new URLSearchParams(sp);
    if (next === 0) n.delete("page");
    else n.set("page", String(next));
    setSp(n, { replace: true });
  }

  if (denied) return denied;
  if (campaignsQ.isLoading || overviewQ.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Ads & Campaigns" />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }
  if (campaignsQ.error) {
    if (isAdminApiAuthFailure(campaignsQ.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={campaignsQ.error.message} onRetry={() => void campaignsQ.refetch()} />;
  }

  const ctr30d = overview?.events_30d.impressions
    ? ((overview.events_30d.clicks / overview.events_30d.impressions) * 100).toFixed(1)
    : "0.0";

  const statuses = ["all", "active", "draft", "paused", "ended"] as const;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Ads & Campaigns"
        description="Manage sponsored listings, moderate campaigns, and monitor ad revenue."
        actions={
          <Link
            to={adminSpaTo("/admin/control-plane/modules/ads")}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Module Config
          </Link>
        }
      />

      {/* Overview KPIs */}
      {overview && (
        <AdminPanel>
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Overview (30d)</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Active", value: String(overview.campaigns_by_status.active ?? 0) },
              { label: "Impressions", value: overview.events_30d.impressions.toLocaleString() },
              { label: "Clicks", value: overview.events_30d.clicks.toLocaleString() },
              { label: "CTR", value: `${ctr30d}%` },
              { label: "Bookings", value: overview.events_30d.books.toLocaleString() },
              { label: "Revenue", value: fmt(overview.prepaid_revenue_30d_zar) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">{label}</div>
                <div className="mt-1 text-lg font-bold text-gray-900">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-medium text-gray-600 uppercase tracking-wide">By Status</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(overview.campaigns_by_status).map(([s, count]) => (
                  <span key={s} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[s] ?? "bg-gray-100 text-gray-700"}`}>
                    {s}: <strong>{count}</strong>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-medium text-gray-600 uppercase tracking-wide">By Billing Model</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(overview.campaigns_by_model ?? {}).map(([m, count]) => (
                  <span key={m} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
                    {MODEL_LABELS[m] ?? m}: <strong>{count}</strong>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-900">{overview.events_7d.impressions.toLocaleString()}</div>
              <div className="text-xs text-blue-700">7d Impressions</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-blue-900">{overview.events_7d.clicks.toLocaleString()}</div>
              <div className="text-xs text-blue-700">7d Clicks</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-blue-900">{fmt(overview.total_budget_in_campaigns_zar)}</div>
              <div className="text-xs text-blue-700">Total Budget</div>
            </div>
          </div>
        </AdminPanel>
      )}

      {/* Campaigns List */}
      <AdminPanel>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-gray-900">All Campaigns · {total} total</h2>
          <div className="flex gap-2">
            <input
              type="search"
              placeholder="Search provider..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={applySearch}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Search
            </button>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {statuses.map((s) => (
            <button key={s} type="button" className={adminTabButtonClass(status === s)} onClick={() => setStatus(s)}>
              {s}
            </button>
          ))}
        </div>

        {useMemo(() => (
          campaigns.length === 0 ? (
            <EmptyState title="No campaigns" description="No campaigns match these filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Provider</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Model</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Budget</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Spent</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Period</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {campaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-3">
                        <Link
                          to={adminSpaTo(`/admin/ads/${c.id}`)}
                          className="font-medium text-gray-900 underline decoration-gray-400 underline-offset-2 hover:decoration-gray-900"
                        >
                          {c.provider_name}
                        </Link>
                        <div className="text-xs font-mono text-gray-400">{c.id.slice(0, 8)}…</div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600">
                        {MODEL_LABELS[c.billing_model] ?? c.billing_model}
                        {c.billing_model === "time_based" && c.duration_days ? ` (${c.duration_days}d)` : ""}
                        {c.billing_model === "impression_pack" && c.pack_impressions ? ` (${c.pack_impressions} imp)` : ""}
                      </td>
                      <td className="px-3 py-3 text-right font-medium">{fmt(c.budget)}</td>
                      <td className="px-3 py-3 text-right text-gray-600">
                        {c.billing_model === "time_based" ? "—" : fmt(c.spent)}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500">
                        {c.start_at
                          ? `${new Date(c.start_at).toLocaleDateString()}${c.end_at ? ` → ${new Date(c.end_at).toLocaleDateString()}` : " →"}`
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={adminSpaTo(`/admin/ads/${c.id}`)}
                            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            View
                          </Link>
                          {c.status === "active" && (
                            <button
                              type="button"
                              className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
                              disabled={moderateMutation.isPending}
                              onClick={() => { setModerateId(c.id); setModerateAction("paused"); }}
                            >
                              Pause
                            </button>
                          )}
                          {(c.status === "active" || c.status === "paused" || c.status === "draft") && (
                            <button
                              type="button"
                              className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                              disabled={moderateMutation.isPending}
                              onClick={() => { setModerateId(c.id); setModerateAction("ended"); }}
                            >
                              End
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ), [campaigns, moderateMutation.isPending])}

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

      <AdminModal
        open={!!selectedCampaign}
        onClose={() => setModerateId(null)}
        title={moderateAction === "paused" ? "Pause Campaign" : "End Campaign"}
        description={
          moderateAction === "paused"
            ? "Pausing will stop this campaign from showing in sponsored slots."
            : "Ending will permanently stop this campaign. It cannot be restarted."
        }
        footer={
          <>
            <button type="button" className="rounded border border-gray-300 px-3 py-2 text-sm" onClick={() => setModerateId(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={`rounded px-3 py-2 text-sm text-white disabled:opacity-50 ${moderateAction === "ended" ? "bg-red-700 hover:bg-red-800" : "bg-gray-900 hover:bg-gray-800"}`}
              disabled={moderateMutation.isPending}
              onClick={() => {
                if (selectedCampaign) {
                  moderateMutation.mutate({ id: selectedCampaign.id, status: moderateAction, reason: moderateReason });
                }
              }}
            >
              {moderateMutation.isPending ? "Processing…" : moderateAction === "paused" ? "Pause Campaign" : "End Campaign"}
            </button>
          </>
        }
      >
        {selectedCampaign && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm space-y-1 mb-3">
            <p><strong>Provider:</strong> {selectedCampaign.provider_name}</p>
            <p><strong>Model:</strong> {MODEL_LABELS[selectedCampaign.billing_model] ?? selectedCampaign.billing_model}</p>
            <p><strong>Budget:</strong> {fmt(selectedCampaign.budget)} · Spent: {fmt(selectedCampaign.spent)}</p>
          </div>
        )}
        <label className="block text-sm">
          Reason (optional)
          <input
            type="text"
            value={moderateReason}
            onChange={(e) => setModerateReason(e.target.value)}
            placeholder="e.g. Policy violation, billing issue…"
            className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
          />
        </label>
        <AdminMutationAlert errors={[moderateMutation.error]} />
      </AdminModal>
    </div>
  );
}
