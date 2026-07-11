import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Megaphone, Search } from "lucide-react";
import { ADMIN_SECTION_COMMERCIAL } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import {
  TerminalUpsellPanel,
  type TerminalInsightItem,
} from "@/routes/commercial/TerminalUpsellPanel";

const OWNERSHIP_LABELS: Record<string, string> = {
  has_terminal: "Has terminal",
  no_terminal: "No terminal",
  planning_to_get_terminal: "Planning to get one",
  unsure: "Unsure",
};

const INTEREST_LABELS: Record<string, string> = {
  yes: "Yes",
  maybe_later: "Maybe later",
  no: "No",
};

const OWNERSHIP_BADGE: Record<string, string> = {
  has_terminal: "bg-green-100 text-green-800",
  no_terminal: "bg-gray-100 text-gray-700",
  planning_to_get_terminal: "bg-blue-100 text-blue-800",
  unsure: "bg-yellow-100 text-yellow-700",
};

const PIPELINE_BADGE: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-indigo-100 text-indigo-800",
  quoted: "bg-purple-100 text-purple-800",
  won: "bg-green-100 text-green-800",
  lost: "bg-gray-100 text-gray-600",
  dismissed: "bg-gray-100 text-gray-500",
};

const SEGMENTS = [
  { id: "all", label: "All profiles" },
  { id: "upsell_opportunities", label: "Upsell opportunities" },
  { id: "interested", label: "Interested" },
  { id: "has_terminal", label: "Has terminal" },
] as const;

type InsightsResponse = {
  items: TerminalInsightItem[];
  total: number;
  page: number;
  per_page: number;
  counts?: {
    total: number;
    upsell_opportunities: number;
    interested: number;
    in_pipeline: number;
    won: number;
  };
};

const PAGE_SIZE = 25;

export function TerminalInsightsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_COMMERCIAL, "Commercial section access required");
  useAdminDocumentTitle("Terminal Insights");

  const location = useLocation();
  const navigate = useNavigate();
  const sp = new URLSearchParams(location.search);

  const page = parseInt(sp.get("page") || "1", 10);
  const ownershipFilter = sp.get("terminal_ownership_status") || "";
  const interestFilter = sp.get("interested_in_platform_terminal") || "";
  const providerFilter = sp.get("terminal_provider") || "";
  const segment = sp.get("segment") || "all";
  const search = sp.get("search") || "";
  const [searchDraft, setSearchDraft] = useState(search);
  const [selectedItem, setSelectedItem] = useState<TerminalInsightItem | null>(null);
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery<InsightsResponse>({
    queryKey: [
      ...adminQueryKeys.commercialTerminalInsights,
      { page, ownershipFilter, interestFilter, providerFilter, segment, search },
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", String(PAGE_SIZE));
      if (ownershipFilter) params.set("terminal_ownership_status", ownershipFilter);
      if (interestFilter) params.set("interested_in_platform_terminal", interestFilter);
      if (providerFilter) params.set("terminal_provider", providerFilter);
      if (segment && segment !== "all") params.set("segment", segment);
      if (search) params.set("search", search);
      return adminApi.getJson(`/api/admin/commercial/terminal-insights?${params}`);
    },
    enabled: allowed,
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    navigate(`${location.pathname}?${next}`);
  }

  function setPage(nextPage: number) {
    const next = new URLSearchParams(location.search);
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    navigate(`${location.pathname}?${next}`);
  }

  function applySearch() {
    setFilter("search", searchDraft.trim());
  }

  if (denied) return denied;
  if (isLoading) return <AdminPageSkeleton />;
  if (isError) {
    if (isAdminApiAuthFailure(error)) return denied;
    return <AdminRetryBlock message="Failed to load terminal insights" onRetry={() => refetch()} />;
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const counts = data?.counts;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  useEffect(() => {
    if (!selectedItem) return;
    const fresh = items.find((i) => i.provider_id === selectedItem.provider_id);
    if (fresh) setSelectedItem(fresh);
  }, [items, selectedItem?.provider_id]);

  const broadcastSegment = segment === "all" ? "upsell_opportunities" : segment;
  const broadcastSegmentLabel =
    SEGMENTS.find((s) => s.id === broadcastSegment)?.label ?? "Upsell opportunities";

  async function startSegmentBroadcast() {
    setBroadcastLoading(true);
    try {
      const res = await adminApi.getJson<{
        segment: string;
        provider_count: number;
        user_ids: string[];
      }>(
        `/api/admin/commercial/terminal-insights/recipients?segment=${encodeURIComponent(broadcastSegment)}`,
      );
      const userIds = res?.user_ids ?? [];
      if (userIds.length === 0) {
        adminToast.error("No providers with linked accounts in this segment.");
        return;
      }
      navigate(adminSpaTo("/admin/broadcast/compose"), {
        state: {
          audience: {
            user_ids: userIds,
            app_type: "provider",
            label: `Terminal Insights — ${broadcastSegmentLabel}`,
            announcement_type: "promotion",
            deep_link: "/(app)/(tabs)/more/terminal-shop",
            cta_label: "View terminals",
          },
        },
      });
    } catch (e) {
      adminToast.error(e instanceof Error ? e.message : "Failed to resolve segment audience");
    } finally {
      setBroadcastLoading(false);
    }
  }

  async function exportCsv() {
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("per_page", "500");
      if (ownershipFilter) params.set("terminal_ownership_status", ownershipFilter);
      if (interestFilter) params.set("interested_in_platform_terminal", interestFilter);
      if (providerFilter) params.set("terminal_provider", providerFilter);
      if (segment && segment !== "all") params.set("segment", segment);
      if (search) params.set("search", search);
      const batch = await adminApi.getJson<InsightsResponse>(`/api/admin/commercial/terminal-insights?${params}`);
      const rows = batch?.items ?? [];
      const header = [
        "Provider",
        "Ownership",
        "Plan",
        "Plan includes terminal",
        "Upsell opportunity",
        "Pipeline status",
        "Interest",
        "Terminal provider",
        "Source",
        "Updated",
      ];
      const lines = rows.map((item) =>
        [
          item.providers?.business_name ?? item.provider_id,
          item.terminal_ownership_status ?? "",
          item.plan_name ?? "",
          item.plan_includes_terminal ? "yes" : "no",
          item.is_upsell_opportunity ? "yes" : "no",
          item.upsell_lead?.status ?? "",
          item.interested_in_platform_terminal ?? "",
          item.terminal_provider ?? "",
          item.source ?? "",
          item.updated_at ? new Date(item.updated_at).toISOString() : "",
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(","),
      );
      const csv = [header.join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `terminal-insights-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Terminal Insights"
        description="Identify providers without card machines who are not on terminal-bundle plans — and run the upsell pipeline."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={adminToolbarButtonClass()}
              disabled={broadcastLoading}
              onClick={() => void startSegmentBroadcast()}
              title={`Compose a targeted broadcast to "${broadcastSegmentLabel}"`}
            >
              <Megaphone className="h-4 w-4" />
              {broadcastLoading ? "Resolving audience…" : `Broadcast to ${broadcastSegmentLabel.toLowerCase()}`}
            </button>
            <button type="button" className={adminToolbarButtonClass()} onClick={() => void exportCsv()}>
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        }
      />

      {counts ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <AdminMetricCard label="Captured profiles" value={counts.total.toLocaleString()} variant="slate" />
          <AdminMetricCard label="Upsell opportunities" value={counts.upsell_opportunities.toLocaleString()} variant="amber" />
          <AdminMetricCard label="Interested" value={counts.interested.toLocaleString()} variant="violet" />
          <AdminMetricCard label="In pipeline" value={counts.in_pipeline.toLocaleString()} variant="emerald" />
          <AdminMetricCard label="Won" value={counts.won.toLocaleString()} variant="rose" />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setFilter("segment", s.id === "all" ? "" : s.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              (segment === s.id || (s.id === "all" && !sp.get("segment")))
                ? "bg-gray-900 text-white"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <AdminPanel>
        <div className="flex flex-wrap gap-3 p-4">
          <div className="flex min-w-[200px] flex-1 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              placeholder="Search provider name…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <button type="button" onClick={applySearch} className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
              Search
            </button>
          </div>
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            value={ownershipFilter}
            onChange={(e) => setFilter("terminal_ownership_status", e.target.value)}
          >
            <option value="">All ownership statuses</option>
            <option value="has_terminal">Has terminal</option>
            <option value="no_terminal">No terminal</option>
            <option value="planning_to_get_terminal">Planning to get one</option>
            <option value="unsure">Unsure</option>
          </select>
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            value={interestFilter}
            onChange={(e) => setFilter("interested_in_platform_terminal", e.target.value)}
          >
            <option value="">All interest levels</option>
            <option value="yes">Interested</option>
            <option value="maybe_later">Maybe later</option>
            <option value="no">Not interested</option>
          </select>
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            value={providerFilter}
            onChange={(e) => setFilter("terminal_provider", e.target.value)}
          >
            <option value="">All terminal providers</option>
            <option value="yoco">Yoco</option>
            <option value="ikhokha">iKhokha</option>
            <option value="capitec">Capitec</option>
            <option value="fnb">FNB</option>
            <option value="nedbank">Nedbank</option>
            <option value="absa">Absa</option>
            <option value="standard_bank">Standard Bank</option>
            <option value="psp">PSP</option>
            <option value="other">Other</option>
          </select>
        </div>
      </AdminPanel>

      <div className={cn("grid gap-4", selectedItem ? "lg:grid-cols-[1fr_360px]" : "")}>
        <AdminPanel>
          {items.length === 0 ? (
            <EmptyState
              title="No terminal profiles match"
              description="Try a different segment or wait for providers to complete onboarding."
            />
          ) : (
            <AdminDataTable>
              <AdminTableHead>
                <tr>
                  <AdminTh>Provider</AdminTh>
                  <AdminTh>Ownership</AdminTh>
                  <AdminTh>Plan</AdminTh>
                  <AdminTh>Pipeline</AdminTh>
                  <AdminTh>Interest</AdminTh>
                  <AdminTh>Updated</AdminTh>
                  <AdminTh />
                </tr>
              </AdminTableHead>
              <AdminTableBody>
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/60">
                    <AdminTd>
                      <Link
                        to={`/admin/providers/${item.provider_id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {item.providers?.business_name ?? item.provider_id}
                      </Link>
                      {item.is_upsell_opportunity ? (
                        <span className="ml-2 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                          Upsell
                        </span>
                      ) : null}
                    </AdminTd>
                    <AdminTd>
                      {item.terminal_ownership_status ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            OWNERSHIP_BADGE[item.terminal_ownership_status] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {OWNERSHIP_LABELS[item.terminal_ownership_status] ?? item.terminal_ownership_status}
                        </span>
                      ) : (
                        "—"
                      )}
                    </AdminTd>
                    <AdminTd>
                      <div className="text-sm">{item.plan_name ?? "—"}</div>
                      {item.plan_includes_terminal ? (
                        <span className="text-xs text-green-700">Terminal included</span>
                      ) : null}
                    </AdminTd>
                    <AdminTd>
                      {item.upsell_lead?.status ? (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            PIPELINE_BADGE[item.upsell_lead.status] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {item.upsell_lead.status}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </AdminTd>
                    <AdminTd>
                      {item.interested_in_platform_terminal
                        ? INTEREST_LABELS[item.interested_in_platform_terminal] ?? item.interested_in_platform_terminal
                        : "—"}
                    </AdminTd>
                    <AdminTd className="text-gray-500">
                      {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : "—"}
                    </AdminTd>
                    <AdminTd>
                      <button
                        type="button"
                        onClick={() => setSelectedItem(item)}
                        className="text-sm font-medium text-indigo-600 hover:underline"
                      >
                        Manage
                      </button>
                    </AdminTd>
                  </tr>
                ))}
              </AdminTableBody>
            </AdminDataTable>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages} ({total} total)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="rounded px-3 py-1 text-sm border border-gray-200 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="rounded px-3 py-1 text-sm border border-gray-200 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </AdminPanel>

        {selectedItem ? (
          <TerminalUpsellPanel item={selectedItem} onClose={() => setSelectedItem(null)} />
        ) : null}
      </div>
    </div>
  );
}
