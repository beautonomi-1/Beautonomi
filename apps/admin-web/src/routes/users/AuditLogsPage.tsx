import { Fragment, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_USERS_TRUST, ADMIN_SECTION_PLATFORM_CONFIG } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminSession } from "@/providers/AdminSessionProvider";
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
import { downloadAdminBlob } from "@/lib/adminCsvDownload";
import { adminToast } from "@/lib/adminToast";
import { cn } from "@/lib/cn";

type LogRow = Record<string, unknown> & {
  id?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  created_at?: string;
  module?: string;
  risk_level?: string;
  status?: string;
  reason?: string;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  request_id?: string;
  before_json?: Record<string, unknown> | null;
  after_json?: Record<string, unknown> | null;
  changed_fields?: string[] | null;
  metadata_json?: Record<string, unknown> | null;
  actor_role?: string;
  superadmin_bypass_used?: boolean;
  actor?: { id?: string; full_name?: string; email?: string } | null;
};

type LogsEnvelope = {
  data: LogRow[];
  meta?: { page: number; limit: number; total: number; has_more: boolean };
};

const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
const STATUSES = ["attempted", "succeeded", "failed"] as const;
const PAGE_SIZES = [20, 30, 50, 100] as const;

function riskBadgeClass(risk: string): string {
  switch (risk) {
    case "critical": return "bg-red-100 text-red-800";
    case "high": return "bg-orange-100 text-orange-800";
    case "medium": return "bg-amber-100 text-amber-800";
    case "low": return "bg-green-100 text-green-800";
    default: return "bg-gray-100 text-gray-700";
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "succeeded": return "bg-green-100 text-green-800";
    case "failed": return "bg-red-100 text-red-800";
    case "attempted": return "bg-amber-100 text-amber-800";
    default: return "bg-gray-100 text-gray-700";
  }
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(iso).slice(0, 19);
  }
}

function JsonDiff({ before, after, fields }: { before?: Record<string, unknown> | null; after?: Record<string, unknown> | null; fields?: string[] | null }) {
  const changedKeys = fields ?? (before && after ? Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])) : []);
  if (!before && !after) return <p className="text-sm text-gray-400 italic">No state data recorded.</p>;
  if (changedKeys.length === 0 && before && after) return <p className="text-sm text-gray-400 italic">No field-level changes detected.</p>;
  return (
    <div className="space-y-1 text-xs font-mono">
      {changedKeys.map((field) => (
        <div key={field} className="flex flex-wrap gap-2">
          <span className="font-semibold text-gray-700">{field}:</span>
          {before?.[field] !== undefined && (
            <span className="rounded bg-red-50 px-1 text-red-700 line-through">{JSON.stringify(before[field])}</span>
          )}
          {after?.[field] !== undefined && (
            <span className="rounded bg-green-50 px-1 text-green-700">{JSON.stringify(after[field])}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Config Change Log tab ────────────────────────────────────────────────────

type ConfigChangeRow = {
  id: string;
  changed_by?: string | null;
  area?: string | null;
  record_key?: string | null;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  created_at?: string;
};

type ConfigChangeEnvelope = {
  items: ConfigChangeRow[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
};

function ConfigChangeLogTab({ canAccess }: { canAccess: boolean }) {
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("ccPage") || "1", 10) || 1);
  const area = sp.get("ccArea") || "";
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const updateParams = useCallback(
    (next: Record<string, string | null>) => {
      const n = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(next)) {
        if (v == null || v === "") n.delete(k);
        else n.set(k, v);
      }
      setSp(n, { replace: true });
    },
    [sp, setSp]
  );

  const q = useQuery({
    queryKey: ["admin", "config-change-log", page, area],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: "20" });
      if (area) p.set("area", area);
      // getJson unwraps the standard { data: T, error: null } envelope;
      // getRawJson would leave items nested under .data.data.
      return adminApi.getJson<ConfigChangeEnvelope>(
        `/api/admin/control-plane/config-change-log?${p}`,
        { timeoutMs: 30_000 }
      );
    },
    enabled: canAccess,
  });

  if (!canAccess) {
    return <PermissionDenied message="Platform config access is required to view the config change log." />;
  }
  if (q.isLoading) return <AdminPageSkeleton rows={5} />;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = q.data ? Math.max(1, Math.ceil(total / q.data.limit)) : 1;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Records every change made via the Platform Advanced (control-plane) config surfaces — integration settings,
        module configs, and environment-scoped feature flags. Separate from the main audit log.
      </p>
      <AdminPanel>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Filter by area (e.g. sumsub, gemini)"
            defaultValue={area}
            onBlur={(e) => updateParams({ ccArea: e.target.value.trim() || null, ccPage: "1" })}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                updateParams({ ccArea: (e.target as HTMLInputElement).value.trim() || null, ccPage: "1" });
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          {area && (
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
              onClick={() => updateParams({ ccArea: null, ccPage: "1" })}
            >
              Clear
            </button>
          )}
          <span className="ml-auto self-center text-sm text-gray-500">{total} record{total !== 1 ? "s" : ""}</span>
        </div>
      </AdminPanel>

      {items.length === 0 ? (
        <EmptyState title="No config changes" description="Config changes made via Platform Advanced will appear here." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>When</AdminTh>
              <AdminTh>Area</AdminTh>
              <AdminTh>Record key</AdminTh>
              <AdminTh>Changed by</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {items.map((row) => {
              const isExpanded = expandedId === row.id;
              return (
                <Fragment key={row.id}>
                  <tr
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                  >
                    <AdminTd className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</AdminTd>
                    <AdminTd className="text-xs">{row.area ?? "—"}</AdminTd>
                    <AdminTd className="text-xs font-mono">{row.record_key ?? "—"}</AdminTd>
                    <AdminTd className="text-xs font-mono">{row.changed_by ?? "system"}</AdminTd>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <AdminTd colSpan={4} className="bg-gray-50 p-4">
                        <div className="grid gap-4 text-sm sm:grid-cols-2">
                          <div>
                            <h4 className="font-semibold text-gray-900">Before</h4>
                            <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-100 p-2 text-xs">
                              {JSON.stringify(row.before_state, null, 2) || "—"}
                            </pre>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">After</h4>
                            <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-100 p-2 text-xs">
                              {JSON.stringify(row.after_state, null, 2) || "—"}
                            </pre>
                          </div>
                        </div>
                      </AdminTd>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}

      {total > 0 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => updateParams({ ccPage: String(page - 1) })}
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => updateParams({ ccPage: String(page + 1) })}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main AuditLogsPage with tab bar ─────────────────────────────────────────

type AuditTab = "audit" | "config-changes";

const TABS: { id: AuditTab; label: string }[] = [
  { id: "audit", label: "Audit Logs" },
  { id: "config-changes", label: "Config Changes" },
];

export function AuditLogsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_USERS_TRUST, "Users & trust access is required.");
  const { canAccess } = useAdminSession();
  const canSeeConfigChanges = canAccess(ADMIN_SECTION_PLATFORM_CONFIG);
  const [sp, setSp] = useSearchParams();
  const activeTab = (sp.get("tab") as AuditTab | null) ?? "audit";

  const setTab = (tab: AuditTab) => {
    const n = new URLSearchParams(sp);
    n.set("tab", tab);
    setSp(n, { replace: true });
  };
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const limit = parseInt(sp.get("limit") || "30", 10) || 30;
  const search = sp.get("search") || "";
  const action = sp.get("action") || "";
  const entityType = sp.get("entity_type") || "";
  const riskLevel = sp.get("risk_level") || "";
  const status = sp.get("status") || "";
  const startDate = sp.get("start_date") || "";
  const endDate = sp.get("end_date") || "";

  const qk = useMemo(
    () => `${page}|${limit}|${search}|${action}|${entityType}|${riskLevel}|${status}|${startDate}|${endDate}`,
    [page, limit, search, action, entityType, riskLevel, status, startDate, endDate]
  );

  const q = useQuery({
    queryKey: adminQueryKeys.auditLogs(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", String(limit));
      if (search) p.set("search", search);
      if (action) p.set("action", action);
      if (entityType) p.set("entity_type", entityType);
      if (riskLevel) p.set("risk_level", riskLevel);
      if (status) p.set("status", status);
      if (startDate) p.set("start_date", startDate);
      if (endDate) p.set("end_date", endDate);
      return adminApi.getRawJson<LogsEnvelope>(`/api/admin/audit-logs?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.data ?? [];
  const meta = q.data?.meta;
  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;

  const updateParams = useCallback(
    (next: Record<string, string | null>) => {
      const n = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(next)) {
        if (v == null || v === "") n.delete(k);
        else n.set(k, v);
      }
      setSp(n, { replace: true });
    },
    [sp, setSp]
  );

  const hasFilters = !!(action || entityType || riskLevel || status || startDate || endDate || search);

  const riskCounts = useMemo(() => {
    const counts: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const r of rows) if (r.risk_level && counts[r.risk_level] !== undefined) counts[r.risk_level]++;
    return counts;
  }, [rows]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { succeeded: 0, failed: 0, attempted: 0 };
    for (const r of rows) if (r.status && counts[r.status] !== undefined) counts[r.status]++;
    return counts;
  }, [rows]);

  if (denied) return denied;

  const tabBar = (
    <div className="flex gap-1 border-b border-gray-200">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            activeTab === t.id
              ? "border-b-2 border-primary text-primary"
              : "text-gray-500 hover:text-gray-800"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  if (activeTab === "config-changes") {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Audit Logs" description="Platform activity trail and config change history." />
        {tabBar}
        <ConfigChangeLogTab canAccess={canSeeConfigChanges} />
      </div>
    );
  }

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Audit Logs" />
        {tabBar}
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
      <AdminPageHeader title="Audit Logs" description="Immutable record of all platform activity." />
      {tabBar}

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {RISK_LEVELS.map((rl) => (
          <div key={rl} className="rounded-xl border border-gray-100 bg-white p-3 text-center shadow-sm">
            <div className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${riskBadgeClass(rl)}`}>{rl}</div>
            <div className="mt-1 text-xl font-bold text-gray-900">{riskCounts[rl]}</div>
          </div>
        ))}
        {STATUSES.map((st) => (
          <div key={st} className="rounded-xl border border-gray-100 bg-white p-3 text-center shadow-sm">
            <div className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(st)}`}>{st}</div>
            <div className="mt-1 text-xl font-bold text-gray-900">{statusCounts[st]}</div>
          </div>
        ))}
      </div>

      {/* Toolbar: Export */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          onClick={() =>
            void downloadAdminBlob("/api/admin/export/audit-logs", `audit-logs-${Date.now()}.csv`).catch(() =>
              adminToast.error("Export failed — please try again")
            )
          }
        >
          Export CSV
        </button>
      </div>

      {/* Filter bar */}
      <AdminPanel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="search"
            placeholder="Search action / entity / role"
            defaultValue={search}
            onBlur={(e) => updateParams({ search: e.target.value.trim() || null, page: "1" })}
            onKeyDown={(e) => { if (e.key === "Enter") updateParams({ search: (e.target as HTMLInputElement).value.trim() || null, page: "1" }); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Action (e.g. create, update)"
            defaultValue={action}
            onBlur={(e) => updateParams({ action: e.target.value.trim() || null, page: "1" })}
            onKeyDown={(e) => { if (e.key === "Enter") updateParams({ action: (e.target as HTMLInputElement).value.trim() || null, page: "1" }); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Entity type"
            defaultValue={entityType}
            onBlur={(e) => updateParams({ entity_type: e.target.value.trim() || null, page: "1" })}
            onKeyDown={(e) => { if (e.key === "Enter") updateParams({ entity_type: (e.target as HTMLInputElement).value.trim() || null, page: "1" }); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            value={riskLevel}
            onChange={(e) => updateParams({ risk_level: e.target.value || null, page: "1" })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All risk levels</option>
            {RISK_LEVELS.map((rl) => <option key={rl} value={rl}>{rl.charAt(0).toUpperCase() + rl.slice(1)}</option>)}
          </select>
          <select
            value={status}
            onChange={(e) => updateParams({ status: e.target.value || null, page: "1" })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {STATUSES.map((st) => <option key={st} value={st}>{st.charAt(0).toUpperCase() + st.slice(1)}</option>)}
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(e) => updateParams({ start_date: e.target.value || null, page: "1" })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            title="Start date"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => updateParams({ end_date: e.target.value || null, page: "1" })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            title="End date"
          />
          {hasFilters && (
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              onClick={() =>
                updateParams({
                  search: null, action: null, entity_type: null, risk_level: null, status: null, start_date: null, end_date: null, page: "1",
                })
              }
            >
              Clear all filters
            </button>
          )}
        </div>
        {meta ? (
          <p className="mt-3 text-sm text-gray-600">
            Page {meta.page} of {totalPages} · showing {rows.length} of {meta.total} logs
          </p>
        ) : null}
      </AdminPanel>

      {/* Table */}
      {rows.length === 0 ? (
        <EmptyState title="No logs" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>When</AdminTh>
              <AdminTh>Actor</AdminTh>
              <AdminTh>Action</AdminTh>
              <AdminTh>Module</AdminTh>
              <AdminTh>Entity</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Risk</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const isExpanded = expandedId === String(r.id);
              return (
                <RowGroup key={String(r.id)} row={r} isExpanded={isExpanded} onToggle={() => setExpandedId(isExpanded ? null : String(r.id))} />
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}

      {/* Pagination */}
      {meta && meta.total > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            Next
          </button>
          <select
            value={String(limit)}
            onChange={(e) => updateParams({ limit: e.target.value, page: "1" })}
            className="ml-auto rounded border border-gray-300 px-2 py-2 text-sm"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={String(s)}>{s} per page</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function RowGroup({ row, isExpanded, onToggle }: { row: LogRow; isExpanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer hover:bg-gray-50" onClick={onToggle}>
        <AdminTd className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</AdminTd>
        <AdminTd className="text-xs">
          <div>{String(row.actor?.full_name ?? "")}</div>
          {row.actor?.email && <div className="text-gray-500">{row.actor.email}</div>}
        </AdminTd>
        <AdminTd className="text-xs">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${riskBadgeClass(row.risk_level ?? "medium")}`}>
            {String(row.action ?? "")}
          </span>
        </AdminTd>
        <AdminTd className="text-xs">{String(row.module ?? "—")}</AdminTd>
        <AdminTd className="text-xs">
          <div>{String(row.entity_type ?? "")}</div>
          {row.entity_id && <div className="font-mono text-[10px] text-gray-400">{String(row.entity_id).slice(0, 12)}…</div>}
        </AdminTd>
        <AdminTd className="text-xs">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(row.status ?? "")}`}>
            {String(row.status ?? "—")}
          </span>
        </AdminTd>
        <AdminTd className="text-xs">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${riskBadgeClass(row.risk_level ?? "")}`}>
            {String(row.risk_level ?? "—")}
          </span>
        </AdminTd>
      </tr>
      {isExpanded && (
        <tr>
          <AdminTd colSpan={7} className="bg-gray-50 p-4">
            <ExpandedDetail row={row} />
          </AdminTd>
        </tr>
      )}
    </>
  );
}

function ExpandedDetail({ row }: { row: LogRow }) {
  return (
    <div className="grid gap-4 text-sm sm:grid-cols-2">
      <div>
        <h4 className="font-semibold text-gray-900">Actor details</h4>
        <dl className="mt-2 space-y-1 text-xs">
          <div><dt className="inline text-gray-500">Name: </dt><dd className="inline">{String(row.actor?.full_name ?? "—")}</dd></div>
          <div><dt className="inline text-gray-500">Email: </dt><dd className="inline">{String(row.actor?.email ?? "—")}</dd></div>
          <div><dt className="inline text-gray-500">Role: </dt><dd className="inline">{String(row.actor_role ?? "—")}</dd></div>
          <div><dt className="inline text-gray-500">Superadmin bypass: </dt><dd className="inline">{row.superadmin_bypass_used ? "Yes" : "No"}</dd></div>
        </dl>
      </div>

      <div>
        <h4 className="font-semibold text-gray-900">Request info</h4>
        <dl className="mt-2 space-y-1 text-xs">
          <div><dt className="inline text-gray-500">IP: </dt><dd className="inline font-mono">{String(row.ip_address ?? "—")}</dd></div>
          <div><dt className="inline text-gray-500">User agent: </dt><dd className="inline break-all">{String(row.user_agent ?? "—")}</dd></div>
          <div><dt className="inline text-gray-500">Session: </dt><dd className="inline font-mono">{String(row.session_id ?? "—")}</dd></div>
          <div><dt className="inline text-gray-500">Request ID: </dt><dd className="inline font-mono">{String(row.request_id ?? "—")}</dd></div>
        </dl>
      </div>

      {row.reason && (
        <div className="sm:col-span-2">
          <h4 className="font-semibold text-gray-900">Reason</h4>
          <p className="mt-1 text-xs text-gray-700">{row.reason}</p>
        </div>
      )}

      <div className="sm:col-span-2">
        <h4 className="font-semibold text-gray-900">Changed fields</h4>
        <div className="mt-2">
          <JsonDiff before={row.before_json} after={row.after_json} fields={row.changed_fields} />
        </div>
      </div>

      {row.metadata_json && Object.keys(row.metadata_json).length > 0 && (
        <div className="sm:col-span-2">
          <h4 className="font-semibold text-gray-900">Metadata</h4>
          <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-100 p-2 text-xs">{JSON.stringify(row.metadata_json, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
