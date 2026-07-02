import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { cn } from "@/lib/cn";

// ─── Shared types ─────────────────────────────────────────────────────────────

interface MetricRow {
  id?: string;
  metric_type?: string;
  metric_name?: string;
  value?: number;
  unit?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  recorded_at?: string;
}

interface SystemHealthData {
  metrics?: MetricRow[];
  stats?: {
    api_requests?: { total: number; successful: number; failed: number; avg_response_time: number };
    database?: { connections: number; query_time: number; slow_queries: number };
    server?: { cpu_usage: number; memory_usage: number; disk_usage: number };
    errors?: { total: number; rate: number };
  };
  timestamp?: string;
  [key: string]: unknown;
}

interface EndpointHealth {
  endpoint?: string;
  method?: string;
  average_response_time_ms?: number;
  success_rate?: number;
  total_checks?: number;
  last_check?: string;
  last_status?: "healthy" | "degraded" | "down" | string;
}

interface MonitoringData {
  overall_status?: "healthy" | "degraded" | "down" | string;
  total_endpoints?: number;
  healthy_endpoints?: number;
  degraded_endpoints?: number;
  down_endpoints?: number;
  average_response_time_ms?: number;
  endpoints?: EndpointHealth[];
  [key: string]: unknown;
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { badge: string; dot: string }> = {
  ok: { badge: "bg-green-100 text-green-800", dot: "bg-green-500" },
  healthy: { badge: "bg-green-100 text-green-800", dot: "bg-green-500" },
  degraded: { badge: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  error: { badge: "bg-red-100 text-red-800", dot: "bg-red-500" },
  down: { badge: "bg-red-100 text-red-800", dot: "bg-red-500" },
};

function StatusDot({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { dot: "bg-gray-400" };
  return <span className={`inline-block h-3 w-3 rounded-full shadow-sm ${s.dot}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { badge: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${s.badge}`}>
      {status}
    </span>
  );
}

// ─── Infrastructure tab ────────────────────────────────────────────────────────

function InfrastructureTab({
  allowed,
  hours,
  onChangeHours,
}: {
  allowed: boolean;
  hours: string;
  onChangeHours: (h: string) => void;
}) {
  const [showRaw, setShowRaw] = useState(false);

  const q = useQuery({
    queryKey: adminQueryKeys.systemHealth(`${hours}`),
    queryFn: async () => {
      const p = new URLSearchParams({ hours });
      return adminApi.getJson<SystemHealthData>(`/api/admin/system-health?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
    refetchInterval: 30_000,
  });

  if (q.isLoading) return <AdminPageSkeleton rows={4} />;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const data = q.data;
  const stats = data?.stats;
  const metrics = Array.isArray(data?.metrics) ? data!.metrics : [];
  const checkedAt = data?.timestamp;

  const errTotal = stats?.errors?.total ?? 0;
  const apiTotal = stats?.api_requests?.total ?? 0;
  const apiFailed = stats?.api_requests?.failed ?? 0;
  const overall: string =
    errTotal > 10 || apiFailed > apiTotal * 0.2
      ? "error"
      : errTotal > 0 || apiFailed > 0
        ? "degraded"
        : "ok";

  const metricsByType = new Map<string, MetricRow[]>();
  for (const m of metrics) {
    const t = m.metric_type ?? "other";
    if (!metricsByType.has(t)) metricsByType.set(t, []);
    metricsByType.get(t)!.push(m);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <select
          value={hours}
          onChange={(e) => onChangeHours(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="1">Last 1h</option>
          <option value="6">Last 6h</option>
          <option value="24">Last 24h</option>
          <option value="72">Last 72h</option>
        </select>
        <button
          type="button"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          onClick={() => void q.refetch()}
        >
          Refresh
        </button>
        <button
          type="button"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          onClick={() => setShowRaw((v) => !v)}
        >
          {showRaw ? "Hide raw" : "Raw data"}
        </button>
      </div>

      <AdminPanel>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusDot status={overall} />
            <div>
              <p className="font-semibold text-gray-900">
                Overall: <span className="capitalize">{overall}</span>
              </p>
              {checkedAt && (
                <p className="text-xs text-gray-500">Last checked: {new Date(checkedAt).toLocaleString()}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-700">{metrics.length} metric{metrics.length !== 1 ? "s" : ""}</span>
            <span className="text-red-700">{errTotal} error{errTotal !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </AdminPanel>

      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminPanel>
            <p className="text-xs font-medium uppercase text-gray-500">API Requests</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.api_requests?.total ?? 0}</p>
            <div className="mt-2 flex gap-3 text-xs">
              <span className="text-green-700">{stats.api_requests?.successful ?? 0} ok</span>
              <span className="text-red-700">{stats.api_requests?.failed ?? 0} failed</span>
            </div>
            {(stats.api_requests?.avg_response_time ?? 0) > 0 && (
              <p className="mt-1 text-xs text-gray-500">Avg {Math.round(stats.api_requests!.avg_response_time)}ms</p>
            )}
          </AdminPanel>
          <AdminPanel>
            <p className="text-xs font-medium uppercase text-gray-500">Database</p>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Connections</span><span className="font-medium">{stats.database?.connections ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Avg query</span><span className="font-medium">{stats.database?.query_time ?? 0}ms</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Slow queries</span><span className={`font-medium ${(stats.database?.slow_queries ?? 0) > 0 ? "text-amber-700" : ""}`}>{stats.database?.slow_queries ?? 0}</span></div>
            </div>
          </AdminPanel>
          <AdminPanel>
            <p className="text-xs font-medium uppercase text-gray-500">Server</p>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">CPU</span><span className="font-medium">{stats.server?.cpu_usage ?? 0}%</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Memory</span><span className="font-medium">{stats.server?.memory_usage ?? 0}%</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Disk</span><span className="font-medium">{stats.server?.disk_usage ?? 0}%</span></div>
            </div>
          </AdminPanel>
          <AdminPanel>
            <p className="text-xs font-medium uppercase text-gray-500">Errors</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.errors?.total ?? 0}</p>
            <p className="mt-1 text-xs text-gray-500">{(stats.errors?.rate ?? 0).toFixed(1)} / hour</p>
          </AdminPanel>
        </div>
      )}

      {metrics.length > 0 ? (
        Array.from(metricsByType.entries()).map(([metricType, rows]) => (
          <AdminPanel key={metricType}>
            <h2 className="mb-3 text-sm font-semibold capitalize text-gray-900">
              {metricType.replace(/_/g, " ")} metrics ({rows.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Value</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Unit</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Recorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((m, i) => (
                    <tr key={String(m.id ?? i)} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs font-medium text-gray-700">{String(m.metric_name ?? "—").replace(/_/g, " ")}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={m.status === "healthy" ? "ok" : m.status ?? "ok"} />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{m.value ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{m.unit ?? ""}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {m.recorded_at ? new Date(m.recorded_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminPanel>
        ))
      ) : (
        <AdminPanel>
          <p className="py-6 text-center text-sm text-gray-400">
            No health metrics recorded in the last {hours} hours.
          </p>
        </AdminPanel>
      )}

      {showRaw && (
        <AdminPanel>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Raw — GET /api/admin/system-health</h2>
          <pre className="max-h-[480px] overflow-auto rounded bg-gray-50 p-4 text-xs">
            {JSON.stringify(q.data, null, 2)}
          </pre>
        </AdminPanel>
      )}
    </div>
  );
}

// ─── API Monitoring tab ────────────────────────────────────────────────────────

function ApiMonitoringTab({
  allowed,
  hours,
  onChangeHours,
}: {
  allowed: boolean;
  hours: string;
  onChangeHours: (h: string) => void;
}) {
  const [showRaw, setShowRaw] = useState(false);

  const q = useQuery({
    queryKey: adminQueryKeys.monitoringHealth(hours),
    queryFn: () =>
      adminApi.getJson<MonitoringData>(`/api/admin/monitoring/health?hours=${encodeURIComponent(hours)}`, {
        timeoutMs: 120_000,
      }),
    enabled: allowed,
    refetchInterval: 60_000,
  });

  if (q.isLoading) return <AdminPageSkeleton rows={4} />;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const data = q.data;
  const overall = data?.overall_status ?? "healthy";
  const endpoints = Array.isArray(data?.endpoints) ? data!.endpoints : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <select
          value={hours}
          onChange={(e) => onChangeHours(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="1">Last 1h</option>
          <option value="6">Last 6h</option>
          <option value="24">Last 24h</option>
          <option value="72">Last 72h</option>
          <option value="168">Last 7d</option>
        </select>
        <button
          type="button"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          onClick={() => void q.refetch()}
        >
          Refresh
        </button>
        <button
          type="button"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          onClick={() => setShowRaw((v) => !v)}
        >
          {showRaw ? "Hide raw" : "Raw data"}
        </button>
      </div>

      <AdminPanel>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusDot status={overall} />
            <p className="font-semibold text-gray-900">
              Platform status: <span className="capitalize">{overall}</span>
            </p>
          </div>
          {data?.average_response_time_ms != null && (
            <p className="text-sm text-gray-500">
              Avg response: <span className="font-mono font-medium">{Math.round(data.average_response_time_ms)}ms</span>
            </p>
          )}
        </div>
      </AdminPanel>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Endpoints", value: data?.total_endpoints ?? 0, cls: "text-gray-900" },
          { label: "Healthy", value: data?.healthy_endpoints ?? 0, cls: "text-green-700" },
          { label: "Degraded", value: data?.degraded_endpoints ?? 0, cls: "text-amber-700" },
          { label: "Down", value: data?.down_endpoints ?? 0, cls: "text-red-700" },
        ].map(({ label, value, cls }) => (
          <AdminPanel key={label}>
            <div className="text-center">
              <div className={`text-2xl font-bold ${cls}`}>{value}</div>
              <div className="mt-1 text-xs text-gray-500">{label}</div>
            </div>
          </AdminPanel>
        ))}
      </div>

      {endpoints.length > 0 ? (
        <AdminPanel>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Endpoint health ({endpoints.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Endpoint</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Method</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Avg time</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Success</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Checks</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Last check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {endpoints.map((ep, i) => (
                  <tr key={`${ep.endpoint}-${ep.method}-${i}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">{ep.endpoint ?? "—"}</td>
                    <td className="px-3 py-2 text-xs font-medium text-gray-600">{ep.method ?? "GET"}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={ep.last_status ?? "unknown"} />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      <span
                        className={cn(
                          "font-medium",
                          (ep.average_response_time_ms ?? 0) > 3000
                            ? "text-red-600"
                            : (ep.average_response_time_ms ?? 0) > 1000
                              ? "text-amber-600"
                              : "text-green-700"
                        )}
                      >
                        {ep.average_response_time_ms ?? 0}ms
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <span
                        className={cn(
                          "font-medium",
                          (ep.success_rate ?? 0) < 90
                            ? "text-red-600"
                            : (ep.success_rate ?? 0) < 99
                              ? "text-amber-600"
                              : "text-green-700"
                        )}
                      >
                        {(ep.success_rate ?? 0).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs font-medium">{ep.total_checks ?? 0}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {ep.last_check ? new Date(ep.last_check).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminPanel>
      ) : (
        <AdminPanel>
          <p className="py-6 text-center text-sm text-gray-400">
            No endpoint health data available. Probes will auto-populate on next monitoring check.
          </p>
        </AdminPanel>
      )}

      {showRaw && (
        <AdminPanel>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Raw — GET /api/admin/monitoring/health</h2>
          <pre className="max-h-[480px] overflow-auto rounded bg-gray-50 p-4 text-xs">
            {JSON.stringify(q.data, null, 2)}
          </pre>
        </AdminPanel>
      )}
    </div>
  );
}

// ─── Platform Health page (merged) ────────────────────────────────────────────

type HealthTab = "infrastructure" | "monitoring";
const TABS: { id: HealthTab; label: string }[] = [
  { id: "infrastructure", label: "Infrastructure" },
  { id: "monitoring", label: "API Monitoring" },
];

export function SystemHealthPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_OPERATIONS, "Operations access is required.");
  const [sp, setSp] = useSearchParams();
  const activeTab = (sp.get("tab") as HealthTab | null) ?? "infrastructure";
  const hours = sp.get("hours") || "24";

  const setTab = (tab: HealthTab) => {
    const n = new URLSearchParams(sp);
    n.set("tab", tab);
    setSp(n, { replace: true });
  };

  const setHours = (h: string) => {
    const n = new URLSearchParams(sp);
    n.set("hours", h);
    setSp(n, { replace: true });
  };

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Platform Health"
        description="Infrastructure metrics and API endpoint health probes — refreshes automatically."
      />

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

      {activeTab === "infrastructure" ? (
        <InfrastructureTab allowed={allowed} hours={hours} onChangeHours={setHours} />
      ) : (
        <ApiMonitoringTab allowed={allowed} hours={hours} onChangeHours={setHours} />
      )}
    </div>
  );
}
