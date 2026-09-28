import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminSavedViewChips } from "@/components/admin/AdminSavedViewChips";
import { AdminFunnelBars } from "@/components/admin/charts/AdminFunnelBars";
import { AdminMetricContractsGlossary } from "@/components/admin/AdminMetricContractsGlossary";
import { adminToast } from "@/lib/adminToast";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { useBrandCampaignStageChange } from "@/components/brand/BrandCampaignStageDialogs";
import { BrandAdvancedMetricsPanel } from "@/routes/brand/BrandAdvancedMetricsPanel";
import { BrandCampaignEditForm } from "@/routes/brand/BrandCampaignEditForm";
import { BrandPlacementForm, type BrandPlacementRow } from "@/routes/brand/BrandPlacementForm";
import { PlacementsGrid } from "@/components/brand/PlacementsGrid";
import { BrandCampaignAudiencePanel } from "@/components/brand/BrandCampaignAudiencePanel";
import { channelLabel } from "@/routes/brand/brandChannels";
import type { BrandCampaignStage } from "@/routes/brand/brandTypes";
import { StageStepper } from "@/components/brand/StageStepper";
import { ExportMenu } from "@/components/brand/ExportMenu";
import { AdminAuditTrailLink } from "@/components/admin/AdminAuditTrailLink";
import { BrandCreativePanel } from "@/components/brand/BrandCreativePanel";
import { BrandEvidencePackPanel } from "@/components/brand/BrandEvidencePackPanel";

const PERIOD_VIEWS = [
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "this_quarter", label: "This quarter" },
  { id: "last_month", label: "Last month" },
] as const;

type FunnelStep = {
  id: string;
  label: string;
  value: number | null;
  source: string;
  hint: string;
  rateFromPrior: number | null;
  amplitude?: { events: string[]; filter: string };
};

type CampaignPayload = {
  campaign: Record<string, unknown> & {
    id: string;
    name: string;
    stage: BrandCampaignStage;
    tracking_code: string;
    updated_at: string;
    budget_envelope?: number;
    objective?: string;
    flight_start?: string;
    flight_end?: string;
    success_target?: number;
    audience_definition?: Record<string, unknown>;
    pillar_id?: string | null;
    plan_id?: string | null;
    brand_placements?: BrandPlacementRow[];
    brand_activity?: Array<{ id: string; kind: string; body: string | null; created_at: string }>;
  };
  period: { label: string; start: string; end: string };
  measured: Record<string, number>;
  spend: { known: number; entered: number; estimated_owned: number; allocated: number };
  settings: { go_live_budget_threshold: number; stale_metric_days: number };
  tracking_kit: { utm_link: string; amplitude_filter: string; provider_lead_source: string };
  funnel: FunnelStep[];
  scorecard: {
    envelope: number;
    allocated: number;
    known_spend: number;
    remaining: number;
    gross_booking_value: number;
    roas: number | null;
    success_target: number;
    actual_outcome: number;
    pace_to_target: number | null;
  };
};

type Tab = "overview" | "placements" | "creative" | "results" | "funnel" | "metrics" | "activity" | "audience";

export function BrandCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [period, setPeriod] = useState<string>("this_month");
  const [tab, setTab] = useState<Tab>("overview");
  const [addingPlacement, setAddingPlacement] = useState(false);
  const [editPlacementId, setEditPlacementId] = useState<string | null>(null);
  useAdminDocumentTitle("Brand campaign");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const qc = useQueryClient();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: adminQueryKeys.brandCampaign(id!, period),
    queryFn: () =>
      adminApi.getJson<CampaignPayload>(`/api/admin/brand/campaigns/${id}?period=${encodeURIComponent(period)}`),
    enabled: !!id,
  });

  const audienceQ = useQuery({
    queryKey: [...adminQueryKeys.brandCampaign(id!, period), "audience"],
    queryFn: () =>
      adminApi.getJson<{
        audience_definition: Record<string, unknown>;
        market_age_brackets: unknown;
        attributed_signup_count: number;
        sample_note: string;
      }>(`/api/admin/brand/campaigns/${id}/audience`),
    enabled: !!id && tab === "audience",
  });

  const cloneMut = useMutation({
    mutationFn: () => adminApi.postJson<{ id: string }>(`/api/admin/brand/campaigns/${id}/clone`, {}),
    onSuccess: (created) => {
      adminToast.success("Campaign duplicated");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.brandCampaigns() });
      if (created?.id) {
        setTab("overview");
        navigate(adminSpaTo(`/admin/brand/campaigns/${created.id}`));
      }
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const { requestStageChange, dialogs } = useBrandCampaignStageChange({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.brandCampaign(id!, period) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.brandCampaigns() });
    },
  });

  if (denied) return denied;
  if (q.isLoading) return <AdminPageSkeleton rows={8} />;
  if (q.error) return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;

  const { campaign, measured, spend, tracking_kit, funnel, scorecard, period: periodInfo } = q.data!;
  const placements = campaign.brand_placements ?? [];
  const trackingCode = campaign.tracking_code;

  const funnelBars = funnel
    .filter((s) => s.value != null && s.id !== "on_site")
    .map((s) => ({
      label: s.label,
      value: s.value ?? 0,
      rate: s.rateFromPrior,
    }));

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "placements", label: "Placements" },
    { id: "creative", label: "Creative" },
    { id: "results", label: "Results" },
    { id: "funnel", label: "Funnel" },
    { id: "metrics", label: "Metrics" },
    { id: "audience", label: "Audience" },
    { id: "activity", label: "Activity" },
  ];

  const onStageSelect = (stage: BrandCampaignStage) => {
    requestStageChange(
      {
        id: campaign.id,
        name: campaign.name,
        stage: campaign.stage,
        updated_at: campaign.updated_at,
        budget_envelope: campaign.budget_envelope ?? null,
      },
      stage,
    );
  };

  return (
    <div className="space-y-4 print:space-y-2">
      {dialogs}
      <AdminPageHeader
        title={campaign.name}
        description={`Code: ${trackingCode} · Stage: ${campaign.stage}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={adminSpaTo("/admin/brand/weekly-update")}
              className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-50"
            >
              Weekly update
            </Link>
            <select
              className="rounded border px-2 py-1.5 text-sm capitalize"
              value={campaign.stage}
              onChange={(e) => onStageSelect(e.target.value as BrandCampaignStage)}
            >
              {(["planning", "creative", "live", "measuring", "closed"] as const).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => cloneMut.mutate()}>
              Duplicate
            </button>
            <ExportMenu campaignId={campaign.id} />
            <AdminAuditTrailLink entityType="brand_campaign" entityId={campaign.id} />
          </div>
        }
      />

      <StageStepper current={campaign.stage} />

      <AdminSavedViewChips
        views={[...PERIOD_VIEWS]}
        activeViewId={period}
        onSelect={setPeriod}
      />
      <p className="text-xs text-zinc-500">
        {periodInfo.label}: {periodInfo.start.slice(0, 10)} → {periodInfo.end.slice(0, 10)} (UTC)
      </p>

      <div className="flex flex-wrap gap-1 border-b pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-full px-3 py-1 text-sm ${tab === t.id ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <AdminMetricCard label="Known spend" value={scorecard.known_spend.toLocaleString()} hint="entered + estimated owned" />
            <AdminMetricCard label="Budget envelope" value={scorecard.envelope.toLocaleString()} hint={`${scorecard.remaining.toLocaleString()} remaining`} />
            <AdminMetricCard
              label="ROAS (gross)"
              value={scorecard.roas != null ? scorecard.roas.toFixed(2) : "—"}
              hint="booking value / known spend"
            />
            <AdminMetricCard
              label="Pace to target"
              value={scorecard.pace_to_target != null ? `${scorecard.pace_to_target}%` : "—"}
              hint={`${scorecard.actual_outcome} / ${scorecard.success_target}`}
            />
          </div>
          <BrandCampaignEditForm
            campaignId={campaign.id}
            initial={{
              name: campaign.name,
              objective: String(campaign.objective ?? ""),
              budget_envelope:
                campaign.budget_envelope != null ? String(campaign.budget_envelope) : "",
              flight_start: campaign.flight_start ? String(campaign.flight_start).slice(0, 10) : "",
              flight_end: campaign.flight_end ? String(campaign.flight_end).slice(0, 10) : "",
              success_target:
                campaign.success_target != null ? String(campaign.success_target) : "",
              pillar_id: campaign.pillar_id ? String(campaign.pillar_id) : "",
              plan_id: campaign.plan_id ? String(campaign.plan_id) : "",
            }}
            onSaved={() => void q.refetch()}
          />
          <AdminPanel title="Tracking kit">
            <ul className="space-y-1 text-sm">
              <li>
                <span className="text-zinc-500">Link:</span> {tracking_kit.utm_link}
              </li>
              <li>
                <span className="text-zinc-500">Amplitude:</span> {tracking_kit.amplitude_filter}
              </li>
              <li>
                <span className="text-zinc-500">Provider lead campaign ID (source "campaign"):</span>{" "}
                {tracking_kit.provider_lead_source}
              </li>
            </ul>
          </AdminPanel>
        </>
      )}

      {tab === "metrics" && (
        <BrandAdvancedMetricsPanel campaignId={campaign.id} period={period} placements={placements} />
      )}

      {tab === "creative" && (
        <>
          <BrandCreativePanel campaignId={campaign.id} />
          <AdminPanel title="Evidence pack">
            <BrandEvidencePackPanel campaignId={campaign.id} campaignName={campaign.name} />
          </AdminPanel>
        </>
      )}

      {tab === "placements" && (
        <AdminPanel title="Placements">
          <PlacementsGrid
            campaignId={campaign.id}
            defaultTrackingCode={trackingCode}
            campaignFlightStart={campaign.flight_start ? String(campaign.flight_start).slice(0, 10) : ""}
            campaignFlightEnd={campaign.flight_end ? String(campaign.flight_end).slice(0, 10) : ""}
            budgetEnvelope={campaign.budget_envelope != null ? Number(campaign.budget_envelope) : null}
            placements={placements}
            onRefresh={() => void q.refetch()}
          />
          <div className="mb-3 mt-6 flex justify-between">
            <p className="text-sm text-zinc-600">{placements.length} lines</p>
            <button
              type="button"
              className="text-sm font-medium text-violet-700"
              onClick={() => {
                setAddingPlacement(true);
                setEditPlacementId(null);
              }}
            >
              Add placement
            </button>
          </div>
          {addingPlacement && (
            <BrandPlacementForm
              campaignId={campaign.id}
              defaultTrackingCode={trackingCode}
              onSaved={() => {
                setAddingPlacement(false);
                void q.refetch();
              }}
              onCancel={() => setAddingPlacement(false)}
            />
          )}
          <ul className="mt-4 space-y-3">
            {placements.map((p) => (
              <li key={p.id} className="rounded border border-zinc-100 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{p.name ?? channelLabel(p.channel_key)}</p>
                    <p className="text-xs text-zinc-500">
                      {channelLabel(p.channel_key)} · {p.tracking_code ?? trackingCode}
                      {p.budget != null ? ` · budget ${p.budget}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-violet-700"
                    onClick={() => setEditPlacementId(editPlacementId === p.id ? null : p.id)}
                  >
                    {editPlacementId === p.id ? "Close" : "Edit"}
                  </button>
                </div>
                {editPlacementId === p.id && (
                  <div className="mt-3">
                    <BrandPlacementForm
                      campaignId={campaign.id}
                      defaultTrackingCode={trackingCode}
                      placement={p}
                      onSaved={() => {
                        setEditPlacementId(null);
                        void q.refetch();
                      }}
                      onCancel={() => setEditPlacementId(null)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </AdminPanel>
      )}

      {tab === "results" && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <AdminMetricCard label="Signups" value={String(measured.signups ?? 0)} hint="first-touch UTM" />
            <AdminMetricCard label="Promo redemptions" value={String(measured.promo_redemptions ?? 0)} hint="measured" />
            <AdminMetricCard
              label="Gross booking value"
              value={scorecard.gross_booking_value.toLocaleString()}
              hint="promo + attributed"
            />
          </div>
          <AdminPanel title="Spend breakdown">
            <dl className="grid gap-2 text-sm md:grid-cols-3">
              <div>
                <dt className="text-zinc-500">Entered</dt>
                <dd className="font-medium tabular-nums">{spend.entered.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Estimated owned</dt>
                <dd className="font-medium tabular-nums">{spend.estimated_owned.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Allocated</dt>
                <dd className="font-medium tabular-nums">{spend.allocated.toLocaleString()}</dd>
              </div>
            </dl>
          </AdminPanel>
        </>
      )}

      {tab === "funnel" && (
        <>
          {funnelBars.length > 0 ? (
            <AdminFunnelBars steps={funnelBars} />
          ) : (
            <p className="text-sm text-zinc-500">Enter reach/clicks on placements to populate the funnel.</p>
          )}
          {funnel
            .filter((s) => s.amplitude)
            .map((s) => (
              <AdminPanel key={s.id} title={s.label}>
                <p className="text-sm text-zinc-600">{s.hint}</p>
                <p className="mt-1 font-mono text-xs">{s.amplitude?.filter}</p>
              </AdminPanel>
            ))}
          <AdminMetricContractsGlossary
            title="Brand metric contracts"
            contracts={[
              {
                key: "known_spend",
                label: "Known spend",
                formula: "Entered placement spend + estimated owned send costs",
                source: ["entered", "estimated"],
                timezone: "UTC",
                cadence: "period",
              },
              {
                key: "signups",
                label: "Signups",
                formula: "first_touch_utm_campaign matches campaign or sub-code",
                source: ["measured"],
                timezone: "UTC",
                cadence: "period",
              },
              {
                key: "roas",
                label: "ROAS",
                formula: "Gross attributed booking value / known spend",
                source: ["derived"],
                timezone: "UTC",
                cadence: "period",
              },
            ]}
          />
        </>
      )}

      {tab === "audience" && (
        <>
          {audienceQ.isLoading && <AdminPageSkeleton rows={3} />}
          {audienceQ.error && <AdminRetryBlock message={audienceQ.error.message} onRetry={() => void audienceQ.refetch()} />}
          {audienceQ.data && (
            <>
              <BrandCampaignAudiencePanel
                campaignId={campaign.id}
                period={period}
                audienceDefinition={audienceQ.data.audience_definition as Record<string, unknown>}
                marketAgeBrackets={audienceQ.data.market_age_brackets}
                attributedSignupCount={audienceQ.data.attributed_signup_count}
                sampleNote={audienceQ.data.sample_note}
              />
            </>
          )}
        </>
      )}

      {tab === "activity" && (
        <AdminPanel title="Activity">
          <ul className="space-y-2 text-sm">
            {(campaign.brand_activity ?? []).length === 0 ? (
              <li className="text-zinc-500">No activity yet.</li>
            ) : (
              (campaign.brand_activity ?? []).map((a) => (
                <li key={a.id} className="border-b border-zinc-100 pb-2">
                  <span className="text-xs text-zinc-500">{a.created_at.slice(0, 16)}</span>
                  <span className="ml-2 font-medium">{a.kind}</span>
                  {a.body ? <p className="text-zinc-700">{a.body}</p> : null}
                </li>
              ))
            )}
          </ul>
        </AdminPanel>
      )}

    </div>
  );
}
