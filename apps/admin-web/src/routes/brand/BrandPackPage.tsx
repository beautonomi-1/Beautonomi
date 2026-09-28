import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminSavedViewChips } from "@/components/admin/AdminSavedViewChips";
import { AdminFunnelBars } from "@/components/admin/charts/AdminFunnelBars";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { downloadAdminBlob } from "@/lib/adminCsvDownload";
import { adminToast } from "@/lib/adminToast";

const PERIOD_VIEWS = [
  { id: "this_month", label: "This month" },
  { id: "this_quarter", label: "This quarter" },
  { id: "this_year", label: "This year" },
  { id: "last_30", label: "Last 30 days" },
] as const;

type FunnelStep = { id: string; label: string; value: number | null; rateFromPrior: number | null };

type PackPayload = {
  spend: { known: number; entered: number; estimated_owned: number };
  spend_compare: { known: number } | null;
  period_efficiency: { value: number | null; label: string };
  utc_note: string;
  platform: { new_customers: number; new_customers_compare: number | null; label: string };
  funnel: {
    demand: FunnelStep[];
    supply: FunnelStep[] | null;
    totals: Record<string, number>;
  };
  growth: {
    spend_change_pct: number | null;
    signup_change_pct: number | null;
    attributed_signups: number;
    gross_booking_value: number;
  };
  pillars?: Array<{
    pillar_id: string;
    pillar_name: string;
    campaign_count: number;
    known_spend: number;
    budget_envelope: number;
  }>;
};

function funnelToBars(steps: FunnelStep[]) {
  return steps
    .filter((s) => s.value != null && s.id !== "on_site")
    .map((s) => ({ label: s.label, value: s.value ?? 0, rate: s.rateFromPrior }));
}

export function BrandPackPage() {
  useAdminDocumentTitle("Brand pack");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const session = useAdminSession();
  const isSuperadmin = session.bootstrap?.isSuperadmin ?? false;
  const [tab, setTab] = useState<"market" | "all">("market");
  const [period, setPeriod] = useState("this_quarter");
  const [downloading, setDownloading] = useState(false);

  const packQ = useQuery({
    queryKey: adminQueryKeys.brandPack(period),
    queryFn: () => adminApi.getJson<PackPayload>(`/api/admin/brand/pack?period=${encodeURIComponent(period)}`),
    enabled: tab === "market",
  });

  const allQ = useQuery({
    queryKey: adminQueryKeys.brandPackAll(period),
    queryFn: () =>
      adminApi.getJson<{ markets: unknown[]; totals: Record<string, unknown> }>(
        `/api/admin/brand/pack/all?period=${encodeURIComponent(period)}`,
      ),
    enabled: tab === "all" && isSuperadmin,
  });

  if (denied) return denied;

  const exportPath = `/api/admin/brand/pack/export?period=${encodeURIComponent(period)}`;
  const demandBars = packQ.data?.funnel?.demand ? funnelToBars(packQ.data.funnel.demand) : [];

  return (
    <div className="space-y-4 print:text-black">
      <AdminPageHeader
        title="Pack"
        description="Period read for leadership. Numbers are labeled by source in campaign detail."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={downloading}
              className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
              onClick={() => {
                setDownloading(true);
                downloadAdminBlob(exportPath, `brand-pack-${period}.csv`)
                  .catch((e: Error) => adminToast.error(e.message))
                  .finally(() => setDownloading(false));
              }}
            >
              {downloading ? "Preparing…" : "Download CSV"}
            </button>
            {isSuperadmin ? (
              <div className="flex gap-2 text-sm">
                <button type="button" className={tab === "market" ? "font-semibold" : ""} onClick={() => setTab("market")}>
                  This market
                </button>
                <button type="button" className={tab === "all" ? "font-semibold" : ""} onClick={() => setTab("all")}>
                  All markets
                </button>
              </div>
            ) : null}
          </div>
        }
      />

      <AdminSavedViewChips views={[...PERIOD_VIEWS]} activeViewId={period} onSelect={setPeriod} />

      {tab === "market" && (
        <>
          {packQ.isLoading && <AdminPageSkeleton rows={4} />}
          {packQ.error && <AdminRetryBlock message={packQ.error.message} onRetry={() => void packQ.refetch()} />}
          {packQ.data && (
            <>
              <p className="text-xs text-zinc-500">{packQ.data.utc_note}</p>
              <div className="grid gap-3 md:grid-cols-3">
                <AdminMetricCard label="Known spend" value={packQ.data.spend.known.toLocaleString()} hint="entered + estimated owned" />
                <AdminMetricCard
                  label="Period efficiency"
                  value={
                    packQ.data.period_efficiency.value != null
                      ? packQ.data.period_efficiency.value.toFixed(2)
                      : "—"
                  }
                  hint={packQ.data.period_efficiency.label}
                />
                <AdminMetricCard
                  label="New customers"
                  value={String(packQ.data.platform.new_customers)}
                  hint={packQ.data.platform.label}
                />
              </div>

              <AdminPanel title="Growth vs previous period">
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-sm">
                  <div>
                    <p className="text-zinc-500">Spend change</p>
                    <p className="font-semibold tabular-nums">
                      {packQ.data.growth.spend_change_pct != null ? `${packQ.data.growth.spend_change_pct}%` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Signup change</p>
                    <p className="font-semibold tabular-nums">
                      {packQ.data.growth.signup_change_pct != null ? `${packQ.data.growth.signup_change_pct}%` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Attributed signups</p>
                    <p className="font-semibold tabular-nums">{packQ.data.growth.attributed_signups}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Gross booking value</p>
                    <p className="font-semibold tabular-nums">{packQ.data.growth.gross_booking_value.toLocaleString()}</p>
                  </div>
                </div>
              </AdminPanel>

              {(packQ.data.pillars?.length ?? 0) > 0 && (
                <AdminPanel title="Roll-up by pillar">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-zinc-500">
                        <th className="py-2 pr-2">Pillar</th>
                        <th className="py-2 pr-2">Campaigns</th>
                        <th className="py-2 pr-2">Envelope</th>
                        <th className="py-2">Known spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packQ.data.pillars!.map((p) => (
                        <tr key={p.pillar_id} className="border-b border-zinc-100">
                          <td className="py-2 pr-2 font-medium">{p.pillar_name}</td>
                          <td className="py-2 pr-2 tabular-nums">{p.campaign_count}</td>
                          <td className="py-2 pr-2 tabular-nums">{p.budget_envelope.toLocaleString()}</td>
                          <td className="py-2 tabular-nums">{p.known_spend.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </AdminPanel>
              )}

              {demandBars.length > 0 && (
                <AdminPanel title="Demand funnel (all campaigns)">
                  <AdminFunnelBars steps={demandBars} />
                </AdminPanel>
              )}
              {packQ.data.funnel.supply && packQ.data.funnel.supply.length > 0 && (
                <AdminPanel title="Supply funnel (aggregated)">
                  <AdminFunnelBars steps={funnelToBars(packQ.data.funnel.supply)} />
                </AdminPanel>
              )}
            </>
          )}
        </>
      )}

      {tab === "all" && isSuperadmin && (
        <>
          {allQ.isLoading && <AdminPageSkeleton rows={4} />}
          {allQ.error && <AdminRetryBlock message={allQ.error.message} onRetry={() => void allQ.refetch()} />}
          {allQ.data && (
            <AdminPanel title="All markets (ZAR at period end)">
              <pre className="overflow-auto text-xs">{JSON.stringify(allQ.data, null, 2)}</pre>
            </AdminPanel>
          )}
        </>
      )}
    </div>
  );
}
