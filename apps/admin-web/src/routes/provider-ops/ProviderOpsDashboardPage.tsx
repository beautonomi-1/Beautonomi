import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { adminSpaTo } from "@/lib/adminSpaPath";

interface DashboardData {
  urgent: { stalled_signups: number; dropped_off: number; pending_approval: number };
  kpis: { signups_today: number; signups_this_week: number; leads_this_week: number; active_providers: number; total_leads: number };
  pipeline: Record<string, number>;
  recent_activities: { id: string; activity_type: string; description: string; created_at: string }[];
}

const STAGE_COLORS: Record<string, string> = {
  new: "bg-blue-400", contacted: "bg-cyan-400", qualified: "bg-emerald-400",
  proposal_sent: "bg-violet-400", negotiating: "bg-purple-400", won: "bg-green-500",
  lost: "bg-red-400", nurture: "bg-amber-400", matched: "bg-teal-500",
};

export function ProviderOpsDashboardPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");

  const q = useQuery({
    queryKey: adminQueryKeys.providerOps.dashboard(),
    queryFn: () => adminApi.getJson<DashboardData>("/api/admin/provider-ops/dashboard", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  if (denied) return denied;
  if (q.isLoading) return <div className="space-y-6"><AdminPageHeader title="Provider Ops Hub" /><AdminPanel><AdminPageSkeleton rows={6} /></AdminPanel></div>;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const data = q.data;
  if (!data) return <AdminRetryBlock message="No data returned" onRetry={() => void q.refetch()} />;

  const urgentTotal = data.urgent.stalled_signups + data.urgent.dropped_off + data.urgent.pending_approval;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Provider Ops Hub"
        description="Supply operations overview — who needs help right now"
        actions={
          <div className="flex gap-2">
            <Link to={adminSpaTo("/admin/provider-ops/leads/new")} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Add Lead</Link>
            <Link to={adminSpaTo("/admin/provider-ops/tracker")} className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800">Tracker</Link>
          </div>
        }
      />

      {urgentTotal > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <UrgentCard label="Stalled Signups" count={data.urgent.stalled_signups} color="red" href="/admin/provider-ops/tracker?status=stalled" desc="No progress for 24+ hours" />
          <UrgentCard label="Dropped Off" count={data.urgent.dropped_off} color="red" href="/admin/provider-ops/tracker?status=dropped_off" desc="No progress for 7+ days" />
          <UrgentCard label="Pending Approval" count={data.urgent.pending_approval} color="amber" href="/admin/provider-ops/activation" desc="Ready for review" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <KpiCard label="Signups Today" value={data.kpis.signups_today} />
        <KpiCard label="Signups This Week" value={data.kpis.signups_this_week} />
        <KpiCard label="Leads This Week" value={data.kpis.leads_this_week} />
        <KpiCard label="Active Providers" value={data.kpis.active_providers} />
        <KpiCard label="Total Leads" value={data.kpis.total_leads} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminPanel>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Lead Pipeline</h2>
            <Link to={adminSpaTo("/admin/provider-ops/pipeline")} className="text-xs text-blue-600 hover:underline">View board →</Link>
          </div>
          <div className="space-y-2">
            {Object.entries(data.pipeline).map(([stage, count]) => (
              <div key={stage} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${STAGE_COLORS[stage] || "bg-gray-300"}`} />
                  <span className="text-sm capitalize text-gray-700">{stage.replace(/_/g, " ")}</span>
                </div>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{count}</span>
              </div>
            ))}
          </div>
        </AdminPanel>

        <AdminPanel>
          <h2 className="mb-4 text-base font-semibold text-gray-900">Recent Activity</h2>
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {data.recent_activities.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">No recent activity</p>
            ) : (
              data.recent_activities.map((a) => (
                <div key={a.id} className="flex items-start gap-3 border-b pb-3 last:border-0">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-700">{a.description || a.activity_type.replace(/_/g, " ")}</p>
                    <p className="text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString()} · {new Date(a.created_at).toLocaleTimeString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </AdminPanel>
      </div>
    </div>
  );
}

function UrgentCard({ label, count, color, href, desc }: { label: string; count: number; color: "red" | "amber"; href: string; desc: string }) {
  const bg = color === "red" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50";
  const text = color === "red" ? "text-red-700" : "text-amber-700";
  const countCls = color === "red" ? "text-red-600" : "text-amber-600";
  return (
    <Link to={adminSpaTo(href)}>
      <div className={`${bg} cursor-pointer rounded-xl border p-4 transition-shadow hover:shadow-md`}>
        <span className={`text-sm font-medium ${text}`}>{label}</span>
        <p className={`mt-1 text-3xl font-bold ${countCls}`}>{count}</p>
        <p className="mt-1 text-xs text-gray-500">{desc}</p>
      </div>
    </Link>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <AdminPanel className="!p-4">
      <span className="text-xs text-gray-500">{label}</span>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </AdminPanel>
  );
}
