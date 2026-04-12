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

const STATUS_STYLES: Record<string, { badge: string; dot: string }> = {
  ok: { badge: "bg-green-100 text-green-800", dot: "bg-green-500" },
  degraded: { badge: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  error: { badge: "bg-red-100 text-red-800", dot: "bg-red-500" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { badge: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

export function SystemHealthPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_OPERATIONS, "Operations access is required.");
  const [sp, setSp] = useSearchParams();
  const hours = sp.get("hours") || "24";
  const type = sp.get("type") || "";
  const [showRaw, setShowRaw] = useState(false);
  const qk = `${hours}|${type}`;

  const q = useQuery({
    queryKey: adminQueryKeys.systemHealth(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("hours", hours);
      if (type) p.set("type", type);
      return adminApi.getJson<SystemHealthData>(`/api/admin/system-health?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
    refetchInterval: 30_000,
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="System health" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }
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
      <AdminPageHeader
        title="System health"
        description="Real-time status of platform infrastructure components."
        actions={
          <div className="flex items-center gap-2">
            <select
              value={hours}
              onChange={(e) => {
                const n = new URLSearchParams(sp);
                n.set("hours", e.target.value);
                setSp(n, { replace: true });
              }}
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
        }
      />

      {/* Overall status banner */}
      <AdminPanel>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-4 w-4 rounded-full ${STATUS_STYLES[overall]?.dot ?? "bg-gray-400"} shadow-sm`} />
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

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminPanel>
            <p className="text-xs font-medium text-gray-500 uppercase">API Requests</p>
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
            <p className="text-xs font-medium text-gray-500 uppercase">Database</p>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Connections</span><span className="font-medium">{stats.database?.connections ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Avg query</span><span className="font-medium">{stats.database?.query_time ?? 0}ms</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Slow queries</span><span className={`font-medium ${(stats.database?.slow_queries ?? 0) > 0 ? "text-amber-700" : ""}`}>{stats.database?.slow_queries ?? 0}</span></div>
            </div>
          </AdminPanel>
          <AdminPanel>
            <p className="text-xs font-medium text-gray-500 uppercase">Server</p>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">CPU</span><span className="font-medium">{stats.server?.cpu_usage ?? 0}%</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Memory</span><span className="font-medium">{stats.server?.memory_usage ?? 0}%</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Disk</span><span className="font-medium">{stats.server?.disk_usage ?? 0}%</span></div>
            </div>
          </AdminPanel>
          <AdminPanel>
            <p className="text-xs font-medium text-gray-500 uppercase">Errors</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.errors?.total ?? 0}</p>
            <p className="mt-1 text-xs text-gray-500">{(stats.errors?.rate ?? 0).toFixed(1)} / hour</p>
          </AdminPanel>
        </div>
      )}

      {/* Metric rows */}
      {metrics.length > 0 ? (
        Array.from(metricsByType.entries()).map(([metricType, rows]) => (
          <AdminPanel key={metricType}>
            <h2 className="mb-3 text-sm font-semibold text-gray-900 capitalize">{metricType.replace(/_/g, " ")} metrics ({rows.length})</h2>
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
            No health metrics recorded in the last {hours} hours. The system will populate data as traffic flows.
          </p>
        </AdminPanel>
      )}

      {showRaw && (
        <AdminPanel>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Raw response (GET /api/admin/system-health)</h2>
          <pre className="max-h-[480px] overflow-auto rounded bg-gray-50 p-4 text-xs">
            {JSON.stringify(q.data, null, 2)}
          </pre>
        </AdminPanel>
      )}
    </div>
  );
}
