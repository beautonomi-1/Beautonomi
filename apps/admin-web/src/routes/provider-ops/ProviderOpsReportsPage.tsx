import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
const LEAD_STAGES = [
  "new", "contacted", "qualified", "proposal_sent", "negotiating", "won", "lost", "nurture", "matched",
] as const;

interface FunnelData {
  onboarding_funnel: { total_signups: number; started_wizard: number; submitted: number; active: number; signup_to_wizard_rate: number; wizard_to_submit_rate: number; submit_to_active_rate: number; overall_conversion_rate: number };
  lead_funnel: { total_leads: number; by_stage: Record<string, number>; by_source: Record<string, number>; matched: number; conversion_rate: number };
  admin_productivity: { admin_assisted_onboardings: number; self_serve_rate: number };
}
interface StepDropoff { total_dropped: number; by_step: { step: number; name: string; count: number }[]; worst_step: { step: number; name: string; count: number } | null }

interface LeadAssigneesReport {
  generated_at: string;
  leads_by_owner: Array<{
    user_id: string | null;
    label: string;
    full_name: string | null;
    email: string | null;
    by_stage: Record<string, number>;
    total_leads: number;
    matched_leads: number;
  }>;
  activity_by_user: Array<{
    user_id: string | null;
    label: string;
    full_name: string | null;
    email: string | null;
    total_activities: number;
    by_type: Record<string, number>;
  }>;
}

interface PreviousSoftwareReport {
  total_providers: number;
  none_count: number;
  by_software: Array<{ slug: string; display_name: string; count: number; pct: number }>;
  generated_at: string;
}

function leadsInboxHrefForAssignee(userId: string | null) {
  const q = userId == null ? "assigned_to=unassigned" : `assigned_to=${encodeURIComponent(userId)}`;
  return adminSpaTo(`/admin/provider-ops/leads?${q}`);
}

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
  const assigneesQ = useQuery({
    queryKey: adminQueryKeys.providerOps.reportsLeadAssignees(),
    queryFn: () =>
      adminApi.getJson<LeadAssigneesReport>("/api/admin/provider-ops/reports/lead-assignees", { timeoutMs: 120_000 }),
    enabled: allowed,
  });

  const softwareQ = useQuery({
    queryKey: adminQueryKeys.providerOps.reportsPreviousSoftware(),
    queryFn: () =>
      adminApi.getJson<PreviousSoftwareReport>("/api/admin/provider-ops/reports/previous-software", {
        timeoutMs: 60_000,
      }),
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

      {/* ── Previous software report ───────────────────────────────────────── */}
      {softwareQ.isLoading && (
        <AdminPanel>
          <h2 className="mb-4 text-base font-semibold text-gray-900">Previous booking software</h2>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      )}
      {!softwareQ.isLoading && softwareQ.data && (
        <AdminPanel>
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Previous booking software</h2>
              <p className="text-xs text-gray-500">
                Which platform providers migrated from at signup ·{" "}
                {softwareQ.data.total_providers} answered · {softwareQ.data.none_count} are new to
                software · Generated{" "}
                {new Date(softwareQ.data.generated_at).toLocaleString()}
              </p>
            </div>
          </div>

          {softwareQ.data.by_software.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">
              No previous software data recorded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {softwareQ.data.by_software.map((row) => {
                const maxCount = Math.max(
                  ...softwareQ.data!.by_software.map((r) => r.count),
                  1,
                );
                const barPct = (row.count / maxCount) * 100;
                return (
                  <div key={row.slug} className="flex items-center gap-3">
                    <div className="w-36 shrink-0 truncate text-sm font-medium text-gray-700">
                      {row.display_name}
                    </div>
                    <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-indigo-400 transition-all"
                        style={{ width: `${barPct}%` }}
                      />
                      <span className="absolute right-2 top-0 flex h-full items-center text-[10px] font-bold text-indigo-900">
                        {row.count}
                      </span>
                    </div>
                    <div className="w-10 shrink-0 text-right text-xs font-medium text-gray-500">
                      {row.pct}%
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {softwareQ.data.none_count > 0 && (
            <div className="mt-4 flex items-center gap-2 border-t pt-4">
              <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                {softwareQ.data.none_count} new to software
              </span>
              <span className="text-xs text-gray-500">
                ({softwareQ.data.total_providers > 0
                  ? Math.round((softwareQ.data.none_count / softwareQ.data.total_providers) * 100)
                  : 0}
                % of respondents)
              </span>
            </div>
          )}
        </AdminPanel>
      )}
      {softwareQ.error && !isAdminApiAuthFailure(softwareQ.error) && (
        <AdminRetryBlock
          message={(softwareQ.error as Error).message}
          onRetry={() => void softwareQ.refetch()}
        />
      )}

      {assigneesQ.isLoading && (
        <AdminPanel>
          <h2 className="mb-4 text-base font-semibold text-gray-900">Lead ownership and activity</h2>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      )}
      {assigneesQ.error && !isAdminApiAuthFailure(assigneesQ.error) && (
        <AdminRetryBlock message={assigneesQ.error.message} onRetry={() => void assigneesQ.refetch()} />
      )}
      {assigneesQ.data && (
        <AdminPanel className="overflow-x-auto">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Lead ownership and activity</h2>
              <p className="text-xs text-gray-500">
                Generated {new Date(assigneesQ.data.generated_at).toLocaleString()} · Open Lead Inbox filtered by owner to drill down.
              </p>
            </div>
          </div>

          <h3 className="mb-2 text-sm font-medium text-gray-800">Leads by assignee</h3>
          <div className="mb-8 overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Matched</th>
                  {LEAD_STAGES.map((s) => (
                    <th key={s} className="hidden px-2 py-2 text-right lg:table-cell">{s.replace(/_/g, " ")}</th>
                  ))}
                  <th className="px-3 py-2 text-right"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assigneesQ.data.leads_by_owner.map((row) => (
                  <tr key={row.user_id ?? "unassigned"} className="hover:bg-gray-50/80">
                    <td className="px-3 py-2 font-medium text-gray-900">{row.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{row.total_leads}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{row.matched_leads}</td>
                    {LEAD_STAGES.map((s) => (
                      <td key={s} className="hidden px-2 py-2 text-right tabular-nums text-gray-600 lg:table-cell">
                        {row.by_stage[s] ?? 0}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={leadsInboxHrefForAssignee(row.user_id)}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        View inbox
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mb-2 text-sm font-medium text-gray-800">Activities by team member</h3>
          <p className="mb-3 text-xs text-gray-500">
            Counts from the lead activity timeline for leads in your tenant.
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">By type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assigneesQ.data.activity_by_user.map((row) => (
                  <tr key={row.user_id ?? "unknown"} className="hover:bg-gray-50/80">
                    <td className="px-3 py-2 font-medium text-gray-900">{row.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{row.total_activities}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {Object.entries(row.by_type)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
