import { useSearchParams, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
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

const STATUS_OPTIONS = ["all", "active", "inactive", "paused"];
const TYPE_OPTIONS = ["all", "booking_reminder", "follow_up", "review_request", "win_back", "birthday", "marketing_broadcast"];

export function AutomationsListPage() {
  useAdminDocumentTitle("Automations");
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const search = sp.get("search") || "";
  const status = sp.get("status") || "all";
  const type = sp.get("type") || "all";
  const [searchInput, setSearchInput] = useState(search);
  const qk = useMemo(() => adminQueryKeys.automations(`q=${search}|s=${status}|t=${type}`), [search, status, type]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (status !== "all") p.set("status", status);
      if (type !== "all") p.set("type", type);
      const qs = p.toString();
      return adminApi.getJson<Record<string, unknown>[]>(`/api/admin/automations${qs ? `?${qs}` : ""}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });
  const rows = q.data ?? [];

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (!value || value === "all") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    navigate({ search: next.toString() }, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Automations" />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Automations" description="Provider and platform marketing automations." />

      <AdminPanel>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          {/* Search */}
          <input
            type="text"
            placeholder="Search by name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && updateFilter("search", searchInput)}
            className="w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            onClick={() => updateFilter("search", searchInput)}
          >
            Search
          </button>

          {/* Status filter */}
          <select
            value={status}
            onChange={(e) => updateFilter("status", e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>

          {/* Type filter */}
          <select
            value={type}
            onChange={(e) => updateFilter("type", e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t === "all" ? "All types" : t.replace(/_/g, " ")}</option>
            ))}
          </select>

          <button
            type="button"
            className={adminToolbarButtonClass(q.isFetching)}
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            Refresh
          </button>

          {(search || status !== "all" || type !== "all") && (
            <button
              type="button"
              onClick={() => { setSearchInput(""); navigate({ search: "" }, { replace: true }); }}
              className="text-xs text-indigo-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </AdminPanel>

      {rows.length === 0 ? (
        <EmptyState title="No automations" description="No automations match the current filters." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Provider</AdminTh>
              <AdminTh>Trigger</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Executions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              const isActive = row.is_active === true || row.is_active === "true";
              return (
                <tr key={String(row.id ?? "")}>
                  <AdminTd className="font-medium">{String(row.name ?? "")}</AdminTd>
                  <AdminTd className="text-xs">{String(row.provider_name ?? "")}</AdminTd>
                  <AdminTd className="text-xs">{String(row.trigger_type ?? "").replace(/_/g, " ")}</AdminTd>
                  <AdminTd>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {isActive ? "Active" : "Inactive"}
                    </span>
                  </AdminTd>
                  <AdminTd className="tabular-nums">{String(row.execution_count ?? "0")}</AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
