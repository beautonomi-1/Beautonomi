import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { PermissionDenied } from "@/components/ui/PermissionDenied";

interface FunnelData {
  onboarding_funnel: { total_signups: number; started_wizard: number; submitted: number; active: number; signup_to_wizard_rate: number; wizard_to_submit_rate: number; submit_to_active_rate: number; overall_conversion_rate: number };
  lead_funnel: { total_leads: number; by_stage: Record<string, number>; by_source: Record<string, number>; matched: number; conversion_rate: number };
  admin_productivity: { admin_assisted_onboardings: number; self_serve_rate: number };
}
interface StepDropoff { total_dropped: number; by_step: { step: number; name: string; count: number }[]; worst_step: { step: number; name: string; count: number } | null }

export function ProviderOpsReportsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");

  const funnelQ = useQuery({
    queryKey: adminQueryKeys.providerOps.reportsFunnel(),
    queryFn: () => adminApi.getJson<FunnelData>("/api/admin/provider-ops/reports/funnel", { timeoutMs: 60_000 }),
    enabled: allowed,
  });
  const dropoffQ = useQuery({
    queryKey: adminQueryKeys.providerOps.reportsDropoff(),
    queryFn: () => adminApi.getJson<StepDropoff>("/api/admin/provider-ops/reports/step-dropoff", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  if (denied) return denied;
  if (funnelQ.isLoading || dropoffQ.isLoading) return <div className="space-y-6"><AdminPageHeader title="Reports" /><AdminPanel><AdminPageSkeleton rows={6} /></AdminPanel></div>;
  if (funnelQ.error) {
    if (isAdminApiAuthFailure(funnelQ.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={funnelQ.error.message} onRetry={() => void funnelQ.refetch()} />;
  }
  if (dropoffQ.error) {
    if (isAdminApiAuthFailure(dropoffQ.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={dropoffQ.error.message} onRetry={() => void dropoffQ.refetch()} />;
  }

  const funnel = funnelQ.data;
  const dropoff = dropoffQ.data;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Reports" description="Onboarding funnel, drop-off analysis, and lead pipeline metrics" />

      {funnel && (
        <AdminPanel>
          <h2 className="mb-4 text-base font-semibold text-gray-900">Onboarding Funnel</h2>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <FunnelStep label="Signups" value={funnel.onboarding_funnel.total_signups} rate={null} />
            <FunnelStep label="Started Wizard" value={funnel.onboarding_funnel.started_wizard} rate={funnel.onboarding_funnel.signup_to_wizard_rate} />
            <FunnelStep label="Submitted" value={funnel.onboarding_funnel.submitted} rate={funnel.onboarding_funnel.wizard_to_submit_rate} />
            <FunnelStep label="Active" value={funnel.onboarding_funnel.active} rate={funnel.onboarding_funnel.submit_to_active_rate} />
          </div>
          <div className="flex items-center gap-2 border-t pt-4">
            <span className="text-sm text-gray-500">Overall conversion rate:</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${funnel.onboarding_funnel.overall_conversion_rate > 50 ? "bg-green-100 text-green-700" : funnel.onboarding_funnel.overall_conversion_rate > 20 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{funnel.onboarding_funnel.overall_conversion_rate}%</span>
          </div>
        </AdminPanel>
      )}

      {dropoff && (
        <AdminPanel>
          <h2 className="mb-1 text-base font-semibold text-gray-900">Step Drop-off Analysis</h2>
          <p className="mb-4 text-xs text-gray-500">{dropoff.total_dropped} providers dropped off{dropoff.worst_step && <> — worst step: <strong>Step {dropoff.worst_step.step}: {dropoff.worst_step.name}</strong></>}</p>
          <div className="space-y-2">
            {dropoff.by_step.map((step) => {
              const maxCount = Math.max(...dropoff.by_step.map((s) => s.count), 1);
              const pct = (step.count / maxCount) * 100;
              return (
                <div key={step.step} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex shrink-0 items-center gap-2 text-xs text-gray-600 sm:w-24 sm:text-right"><span>Step {step.step}</span><span className="text-gray-400 sm:hidden">· {step.name}</span></div>
                  <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full transition-all ${step.count > 0 ? "bg-red-400" : "bg-gray-200"}`} style={{ width: `${pct}%` }} />
                    {step.count > 0 && <span className="absolute right-2 top-0 flex h-full items-center text-[10px] font-bold text-red-800">{step.count}</span>}
                  </div>
                  <span className="hidden w-32 truncate text-xs text-gray-500 sm:inline">{step.name}</span>
                </div>
              );
            })}
          </div>
        </AdminPanel>
      )}

      {funnel && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <AdminPanel>
            <h2 className="mb-4 text-base font-semibold text-gray-900">Lead Pipeline</h2>
            <div className="space-y-2">
              {Object.entries(funnel.lead_funnel.by_stage).map(([stage, count]) => (
                <div key={stage} className="flex items-center justify-between py-1">
                  <span className="text-sm capitalize text-gray-600">{stage.replace(/_/g, " ")}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{count}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <span className="text-sm text-gray-500">Lead → Matched rate:</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{funnel.lead_funnel.conversion_rate}%</span>
            </div>
          </AdminPanel>

          <AdminPanel>
            <h2 className="mb-4 text-base font-semibold text-gray-900">Admin Productivity</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Admin-Assisted Onboardings</span><span className="text-lg font-bold text-gray-800">{funnel.admin_productivity.admin_assisted_onboardings}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-gray-600">Self-Serve Rate</span><span className="text-lg font-bold text-gray-800">{funnel.admin_productivity.self_serve_rate}%</span></div>
              <div className="border-t pt-3">
                <h3 className="mb-2 text-xs uppercase tracking-wider text-gray-500">Leads by Source</h3>
                {Object.entries(funnel.lead_funnel.by_source).map(([source, count]) => (
                  <div key={source} className="flex items-center justify-between py-1">
                    <span className="text-sm capitalize text-gray-600">{source}</span>
                    <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </AdminPanel>
        </div>
      )}
    </div>
  );
}

function FunnelStep({ label, value, rate }: { label: string; value: number; rate: number | null }) {
  return (
    <div className="text-center">
      <p className="text-3xl font-bold text-gray-800">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
      {rate !== null && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${rate > 70 ? "bg-green-100 text-green-700" : rate > 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{rate}% →</span>}
    </div>
  );
}
