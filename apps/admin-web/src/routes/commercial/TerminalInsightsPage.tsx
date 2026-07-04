import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
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
import { adminToolbarButtonClass } from "@/lib/adminUi";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { EmptyState } from "@/components/ui/EmptyState";

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

type InsightsItem = {
  id: string;
  provider_id: string;
  has_payment_terminal: boolean | null;
  terminal_ownership_status: string | null;
  terminal_provider: string | null;
  terminal_count_range: string | null;
  interested_in_platform_terminal: string | null;
  source: string | null;
  updated_at: string;
  providers: {
    id: string;
    business_name: string;
    slug: string | null;
    status: string | null;
  };
};

type InsightsResponse = {
  items: InsightsItem[];
  total: number;
  page: number;
  per_page: number;
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

  const { data, isLoading, isError, error, refetch } = useQuery<InsightsResponse>({
    queryKey: [...adminQueryKeys.commercialTerminalInsights, { page, ownershipFilter, interestFilter, providerFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", String(PAGE_SIZE));
      if (ownershipFilter) params.set("terminal_ownership_status", ownershipFilter);
      if (interestFilter) params.set("interested_in_platform_terminal", interestFilter);
      if (providerFilter) params.set("terminal_provider", providerFilter);
      return adminApi.getJson(`/api/admin/commercial/terminal-insights?${params}`);
    },
    enabled: allowed,
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(location.search);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    navigate(`${location.pathname}?${next}`);
  }

  if (denied) return denied;
  if (isLoading) return <AdminPageSkeleton />;
  if (isError) {
    if (isAdminApiAuthFailure(error)) return denied;
    return <AdminRetryBlock message="Failed to load terminal insights" onRetry={() => refetch()} />;
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Terminal Insights"
        description={`${total.toLocaleString()} provider terminal profile${total !== 1 ? "s" : ""} captured`}
        actions={
          <button className={adminToolbarButtonClass()}>
            <Download className="h-4 w-4" />
            Export
          </button>
        }
      />

      {/* Filters */}
      <AdminPanel>
        <div className="flex flex-wrap gap-3 p-4">
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

      {/* Table */}
      <AdminPanel>
        {items.length === 0 ? (
          <EmptyState
            title="No terminal profiles captured"
            description="Providers who complete onboarding will appear here."
          />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Provider</AdminTh>
                <AdminTh>Ownership status</AdminTh>
                <AdminTh>Terminal provider</AdminTh>
                <AdminTh>Count</AdminTh>
                <AdminTh>Interest</AdminTh>
                <AdminTh>Source</AdminTh>
                <AdminTh>Last updated</AdminTh>
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
                    {item.providers?.status && (
                      <span className="ml-2 text-xs text-gray-500">({item.providers.status})</span>
                    )}
                  </AdminTd>
                  <AdminTd>
                    {item.terminal_ownership_status ? (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${OWNERSHIP_BADGE[item.terminal_ownership_status] ?? "bg-gray-100 text-gray-700"}`}>
                        {OWNERSHIP_LABELS[item.terminal_ownership_status] ?? item.terminal_ownership_status}
                      </span>
                    ) : "—"}
                  </AdminTd>
                  <AdminTd className="capitalize">{item.terminal_provider?.replace(/_/g, " ") ?? "—"}</AdminTd>
                  <AdminTd className="capitalize">{item.terminal_count_range?.replace(/_/g, " ") ?? "—"}</AdminTd>
                  <AdminTd>
                    {item.interested_in_platform_terminal
                      ? (INTEREST_LABELS[item.interested_in_platform_terminal] ?? item.interested_in_platform_terminal)
                      : "—"}
                  </AdminTd>
                  <AdminTd className="capitalize text-gray-500">{item.source ?? "—"}</AdminTd>
                  <AdminTd className="text-gray-500">
                    {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : "—"}
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages} ({total} total)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setFilter("page", String(page - 1))}
                className="rounded px-3 py-1 text-sm border border-gray-200 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setFilter("page", String(page + 1))}
                className="rounded px-3 py-1 text-sm border border-gray-200 disabled:opacity-40"
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
