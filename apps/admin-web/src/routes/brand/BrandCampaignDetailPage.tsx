import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ChevronDown, MoreHorizontal } from "lucide-react";
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
import { BrandCopyValueRow } from "@/components/brand/BrandCopyValueRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { STAGE_META, brandButtonPrimaryClass, brandButtonSecondaryClass } from "@/routes/brand/brandTypes";
import { parseBrandCampaignDetailTab, type BrandCampaignDetailTab } from "@/routes/brand/brandCampaignUrl";
import { cn } from "@/lib/cn";

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

type Tab = BrandCampaignDetailTab;

export function BrandCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseBrandCampaignDetailTab(searchParams.get("tab"));
  const period = searchParams.get("period") ?? "this_month";
  const [addingPlacement, setAddingPlacement] = useState(false);
  const [editPlacementId, setEditPlacementId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(true);
  const moreRef = useRef<HTMLDivElement>(null);
  useAdminDocumentTitle("Brand campaign");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const qc = useQueryClient();
  const navigate = useNavigate();

  const setTab = (next: Tab) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("tab", next);
        return p;
      },
      { replace: true },
    );
  };

  const setPeriod = (next: string) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("period", next);
        return p;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current?.contains(e.target as Node)) return;
      setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen]);

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
    { id: "performance", label: "Performance" },
    { id: "audience", label: "Audience" },
  ];

  const showPeriod = tab === "overview" || tab === "performance";
  const activityItems = campaign.brand_activity ?? [];

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

  const activityPanel = (
    <AdminPanel title="Activity">
      <ul className="max-h-[min(24rem,50vh)] space-y-2 overflow-y-auto text-sm">
        {activityItems.length === 0 ? (
          <li className="text-zinc-500">No activity yet.</li>
        ) : (
          activityItems.map((a) => (
            <li key={a.id} className="border-b border-zinc-100 pb-2">
              <span className="text-xs text-zinc-500">{a.created_at.slice(0, 16)}</span>
              <span className="ml-2 font-medium">{a.kind}</span>
              {a.body ? <p className="text-zinc-700">{a.body}</p> : null}
            </li>
          ))
        )}
      </ul>
    </AdminPanel>
  );

  return (
    <div className="space-y-4 print:space-y-2">
      {dialogs}
      <AdminPageHeader
        title={campaign.name}
        description={`Code: ${trackingCode} · ${STAGE_META[campaign.stage].label}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu campaignId={campaign.id} />
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                className={brandButtonSecondaryClass}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                onClick={() => setMoreOpen((o) => !o)}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
                <span className="sr-only">More actions</span>
              </button>
              {moreOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-1 min-w-[12rem] rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onClick={() => {
                      setMoreOpen(false);
                      cloneMut.mutate();
                    }}
                  >
                    Duplicate
                  </button>
                  <Link
                    role="menuitem"
                    to={adminSpaTo("/admin/brand/weekly-update")}
                    className="block px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={() => setMoreOpen(false)}
                  >
                    Weekly update
                  </Link>
                  <div className="border-t border-gray-100 px-3 py-2">
                    <AdminAuditTrailLink entityType="brand_campaign" entityId={campaign.id} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        }
      />

      <StageStepper current={campaign.stage} onStageSelect={onStageSelect} />

      {showPeriod ? (
        <>
          <AdminSavedViewChips views={[...PERIOD_VIEWS]} activeViewId={period} onSelect={setPeriod} />
          <p className="text-xs text-zinc-500">
            {periodInfo.label}: {periodInfo.start.slice(0, 10)} → {periodInfo.end.slice(0, 10)} (UTC)
          </p>
        </>
      ) : null}

      <div
        className="sticky top-14 z-10 -mx-1 flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50/95 px-1 pb-2 pt-1 backdrop-blur-sm"
        role="tablist"
        aria-label="Campaign sections"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={cn(
              "rounded-full px-3 py-1 text-sm",
              tab === t.id ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100",
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 space-y-4">
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
            <ul className="space-y-2">
              <BrandCopyValueRow label="Link" value={tracking_kit.utm_link} />
              <BrandCopyValueRow label="Amplitude" value={tracking_kit.amplitude_filter} />
              <BrandCopyValueRow label="Provider lead (source campaign)" value={tracking_kit.provider_lead_source} />
            </ul>
          </AdminPanel>
        </>
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-zinc-600">{placements.length} lines</p>
            <button
              type="button"
              className={brandButtonPrimaryClass}
              onClick={() => {
                setAddingPlacement(true);
                setEditPlacementId(null);
              }}
            >
              Add placement
            </button>
          </div>
          <PlacementsGrid
            campaignId={campaign.id}
            defaultTrackingCode={trackingCode}
            campaignFlightStart={campaign.flight_start ? String(campaign.flight_start).slice(0, 10) : ""}
            campaignFlightEnd={campaign.flight_end ? String(campaign.flight_end).slice(0, 10) : ""}
            budgetEnvelope={campaign.budget_envelope != null ? Number(campaign.budget_envelope) : null}
            placements={placements}
            onRefresh={() => void q.refetch()}
          />
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
          {placements.length === 0 && !addingPlacement ? (
            <EmptyState
              title="No placements yet"
              description="Add channels and flight lines for this campaign."
              action={
                <button type="button" className={brandButtonPrimaryClass} onClick={() => setAddingPlacement(true)}>
                  Add placement
                </button>
              }
            />
          ) : null}
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

      {tab === "performance" && (
        <>
          <AdminPanel title="Results">
            <div className="grid gap-3 md:grid-cols-3">
              <AdminMetricCard label="Signups" value={String(measured.signups ?? 0)} hint="first-touch UTM" />
              <AdminMetricCard label="Promo redemptions" value={String(measured.promo_redemptions ?? 0)} hint="measured" />
              <AdminMetricCard
                label="Gross booking value"
                value={scorecard.gross_booking_value.toLocaleString()}
                hint="promo + attributed"
              />
            </div>
            <dl className="mt-4 grid gap-2 text-sm md:grid-cols-3">
              <div>
                <dt className="text-zinc-500">Entered spend</dt>
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
          <AdminPanel title="Funnel">
            {funnelBars.length > 0 ? (
              <AdminFunnelBars steps={funnelBars} />
            ) : (
              <p className="text-sm text-zinc-500">Enter reach/clicks on placements to populate the funnel.</p>
            )}
            {funnel
              .filter((s) => s.amplitude)
              .map((s) => (
                <div key={s.id} className="mt-4 border-t border-zinc-100 pt-4">
                  <p className="text-sm font-medium text-zinc-800">{s.label}</p>
                  <p className="text-sm text-zinc-600">{s.hint}</p>
                  <p className="mt-1 font-mono text-xs">{s.amplitude?.filter}</p>
                </div>
              ))}
          </AdminPanel>
          <AdminPanel title="Advanced metrics">
            <BrandAdvancedMetricsPanel campaignId={campaign.id} period={period} placements={placements} />
          </AdminPanel>
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

        </div>

        <aside className="w-full shrink-0 xl:w-72">
          <div className="xl:sticky xl:top-[7.5rem]">
            <button
              type="button"
              className="mb-2 flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium xl:hidden"
              onClick={() => setActivityOpen((o) => !o)}
            >
              Activity
              <ChevronDown className={cn("h-4 w-4 transition-transform", activityOpen && "rotate-180")} />
            </button>
            <div className={cn(!activityOpen && "hidden xl:block")}>{activityPanel}</div>
          </div>
        </aside>
      </div>

    </div>
  );
}
