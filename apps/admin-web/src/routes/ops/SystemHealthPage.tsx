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

interface HealthCheck {
  name: string;
  status: "ok" | "degraded" | "error" | string;
  latency_ms?: number;
  message?: string | null;
  details?: Record<string, unknown>;
}

interface SystemHealthData {
  overall_status?: "ok" | "degraded" | "error" | string;
  checks?: HealthCheck[];
  summary?: {
    total: number;
    ok: number;
    degraded: number;
    error: number;
  };
  checked_at?: string;
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
  const overall = data?.overall_status ?? "unknown";
  const checks = Array.isArray(data?.checks) ? data!.checks : [];
  const summary = data?.summary;
  const checkedAt = data?.checked_at;

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
          {summary && (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-green-700">{summary.ok} ok</span>
              <span className="text-amber-700">{summary.degraded} degraded</span>
              <span className="text-red-700">{summary.error} errors</span>
            </div>
          )}
        </div>
      </AdminPanel>

      {/* Health checks */}
      {checks.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {checks.map((check) => (
            <AdminPanel key={check.name}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900 capitalize">{check.name.replace(/_/g, " ")}</p>
                  {check.message && (
                    <p className="mt-1 text-xs text-gray-500">{check.message}</p>
                  )}
                </div>
                <StatusBadge status={check.status} />
              </div>
              {check.latency_ms !== undefined && (
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Latency</span>
                  <span className={`font-mono font-medium ${check.latency_ms > 1000 ? "text-red-600" : check.latency_ms > 300 ? "text-amber-600" : "text-green-700"}`}>
                    {check.latency_ms}ms
                  </span>
                </div>
              )}
              {check.details && Object.keys(check.details).length > 0 && (
                <dl className="mt-2 space-y-0.5 text-xs text-gray-500">
                  {Object.entries(check.details).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <dt className="capitalize">{k.replace(/_/g, " ")}</dt>
                      <dd className="font-medium text-gray-700">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </AdminPanel>
          ))}
        </div>
      ) : (
        <AdminPanel>
          <p className="py-6 text-center text-sm text-gray-400">
            No granular health check data available. See raw response below.
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
