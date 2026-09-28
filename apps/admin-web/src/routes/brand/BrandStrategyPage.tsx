import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { adminToast } from "@/lib/adminToast";
import { StrategyHeaderForm } from "@/components/brand/strategy/StrategyHeaderForm";
import { StrategyStatusBar } from "@/components/brand/strategy/StrategyStatusBar";
import { PillarList, type PillarRow } from "@/components/brand/strategy/PillarList";
import { PlanGrid } from "@/components/brand/strategy/PlanGrid";
import { StrategyScorecardTab } from "@/components/brand/strategy/StrategyScorecardTab";
import { StrategyKpiEditor, type StrategyKpiRow } from "@/components/brand/strategy/StrategyKpiEditor";
import { useAdminConfirmAction } from "@/hooks/useAdminConfirmAction";

type PlanRow = { id: string; quarter: number; budget?: number };
type StrategyRow = {
  id: string;
  year: number;
  status: string;
  positioning?: string | null;
  brand_promise?: string | null;
  notes?: string | null;
  archived_at?: string | null;
  brand_pillars?: Array<PillarRow & { brand_plans?: PlanRow[] }>;
  brand_strategy_kpis?: StrategyKpiRow[];
};

export function BrandStrategyPage() {
  useAdminDocumentTitle("Brand strategy");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const [searchParams, setSearchParams] = useSearchParams();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [tab, setTab] = useState<"plan" | "scorecard">("plan");
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()));
  const { requestConfirm, ConfirmDialog } = useAdminConfirmAction();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["brand-strategy", includeArchived],
    queryFn: () =>
      adminApi.getJson<{ items: StrategyRow[] }>(
        `/api/admin/brand/strategy${includeArchived ? "?include_archived=1" : ""}`,
      ),
  });

  const items = q.data?.items ?? [];
  const yearParam = searchParams.get("year");
  const selected = useMemo(() => {
    if (!items.length) return null;
    if (yearParam) {
      const y = Number(yearParam);
      return items.find((s) => s.year === y) ?? items[0];
    }
    return items[0];
  }, [items, yearParam]);

  const locked = selected ? selected.status !== "draft" || !!selected.archived_at : true;

  const patchMut = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      adminApi.patchJson(`/api/admin/brand/strategy/${selected!.id}`, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["brand-strategy"] }),
    onError: (e: Error) => adminToast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: (year: number) =>
      adminApi.postJson("/api/admin/brand/strategy", {
        year,
        positioning: "",
        brand_promise: "",
      }),
    onSuccess: (_data, year) => {
      adminToast.success("Strategy year created");
      setSearchParams({ year: String(year) });
      void q.refetch();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["brand-strategy"] });

  if (denied) return denied;
  if (q.isLoading) return <AdminPageSkeleton rows={4} />;

  return (
    <div className="space-y-4">
      <ConfirmDialog />
      <AdminPageHeader
        title="Strategy"
        description="Pillars, quarterly plans, KPI scorecard and approval."
        actions={
          <button
            type="button"
            className="rounded bg-violet-700 px-3 py-1.5 text-sm text-white"
            onClick={() =>
              requestConfirm({
                title: "Add strategy year",
                consequence: "Creates a draft strategy for the calendar year.",
                confirmLabel: "Create",
                preview: (
                  <label className="block space-y-2">
                    <span className="text-sm text-gray-600">Year</span>
                    <input
                      type="number"
                      className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm"
                      value={newYear}
                      onChange={(e) => setNewYear(e.target.value)}
                    />
                  </label>
                ),
                onConfirm: () => {
                  const year = Number(newYear);
                  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
                    adminToast.error("Enter a valid year");
                    throw new Error("Invalid year");
                  }
                  createMut.mutate(year);
                },
              })
            }
          >
            Add year
          </button>
        }
      />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
        Show archived
      </label>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No strategy yet. Add a year to begin.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 border-b pb-2">
            {items.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`rounded px-3 py-1 text-sm ${selected?.id === s.id ? "bg-violet-100 font-medium text-violet-900" : "hover:bg-zinc-50"}`}
                onClick={() => setSearchParams({ year: String(s.year) })}
              >
                {s.year}
                {s.archived_at ? " (archived)" : ""}
              </button>
            ))}
          </div>

          {selected ? (
            <>
              <StrategyStatusBar strategyId={selected.id} status={selected.status} locked={locked} onChanged={refresh} />
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`rounded px-3 py-1 text-sm ${tab === "plan" ? "bg-zinc-900 text-white" : "border"}`}
                  onClick={() => setTab("plan")}
                >
                  Plan
                </button>
                <button
                  type="button"
                  className={`rounded px-3 py-1 text-sm ${tab === "scorecard" ? "bg-zinc-900 text-white" : "border"}`}
                  onClick={() => setTab("scorecard")}
                >
                  Scorecard
                </button>
              </div>

              {tab === "scorecard" ? (
                <StrategyScorecardTab strategyId={selected.id} />
              ) : (
                <>
                  <AdminPanel title={`${selected.year} strategy`}>
                    <StrategyHeaderForm
                      positioning={selected.positioning ?? ""}
                      brandPromise={selected.brand_promise ?? ""}
                      notes={selected.notes ?? ""}
                      locked={locked}
                      onSave={(patch) => patchMut.mutate(patch)}
                    />
                  </AdminPanel>
                  <AdminPanel title="Pillars">
                    <PillarList
                      strategyId={selected.id}
                      pillars={selected.brand_pillars ?? []}
                      locked={locked}
                      onChanged={refresh}
                    />
                  </AdminPanel>
                  <AdminPanel title="Quarterly plans">
                    <PlanGrid
                      strategyYear={selected.year}
                      pillars={selected.brand_pillars ?? []}
                      locked={locked}
                      onChanged={refresh}
                    />
                  </AdminPanel>
                  <AdminPanel title="KPI targets">
                    <StrategyKpiEditor
                      strategyId={selected.id}
                      year={selected.year}
                      kpis={selected.brand_strategy_kpis ?? []}
                      pillars={selected.brand_pillars ?? []}
                      locked={locked}
                      onChanged={refresh}
                    />
                  </AdminPanel>
                </>
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
