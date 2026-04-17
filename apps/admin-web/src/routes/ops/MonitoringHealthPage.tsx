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

const EP_STATUS_STYLE: Record<string, string> = {
  healthy: "bg-green-100 text-green-800",
  degraded: "bg-amber-100 text-amber-800",
  down: "bg-red-100 text-red-800",
};

const OVERALL_DOT: Record<string, string> = {
  healthy: "bg-green-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
};

export function MonitoringHealthPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_OPERATIONS, "Operations access is required.");
  const [sp, setSp] = useSearchParams();
  const hours = sp.get("hours") || "24";
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

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Monitoring" />
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
  const overall = data?.overall_status ?? "healthy";
  const endpoints = Array.isArray(data?.endpoints) ? data!.endpoints : [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Monitoring"
        description="API endpoint health probes and response times."
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
        }
      />

      {/* Overall status + summary */}
      <AdminPanel>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-4 w-4 rounded-full ${OVERALL_DOT[overall] ?? "bg-gray-400"} shadow-sm`} />
            <p className="font-semibold text-gray-900">
              Platform status: <span className="capitalize">{overall}</span>
            </p>
          </div>
          {data?.average_response_time_ms != null && (
            <p className="text-sm text-gray-500">Avg response: <span className="font-mono font-medium">{Math.round(data.average_response_time_ms)}ms</span></p>
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

      {/* Endpoint table */}
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
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${EP_STATUS_STYLE[ep.last_status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
                        {ep.last_status ?? "unknown"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      <span className={`font-medium ${(ep.average_response_time_ms ?? 0) > 3000 ? "text-red-600" : (ep.average_response_time_ms ?? 0) > 1000 ? "text-amber-600" : "text-green-700"}`}>
                        {ep.average_response_time_ms ?? 0}ms
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <span className={`font-medium ${(ep.success_rate ?? 0) < 90 ? "text-red-600" : (ep.success_rate ?? 0) < 99 ? "text-amber-600" : "text-green-700"}`}>
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
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Raw response (GET /api/admin/monitoring/health)</h2>
          <pre className="max-h-[480px] overflow-auto rounded bg-gray-50 p-4 text-xs">
            {JSON.stringify(q.data, null, 2)}
          </pre>
        </AdminPanel>
      )}
    </div>
  );
}
