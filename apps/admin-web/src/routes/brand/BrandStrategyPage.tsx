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
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminToast } from "@/lib/adminToast";
import { StrategyHeaderForm } from "@/components/brand/strategy/StrategyHeaderForm";
import { StrategyStatusBar } from "@/components/brand/strategy/StrategyStatusBar";
import { PillarList, type PillarRow } from "@/components/brand/strategy/PillarList";
import { PlanGrid } from "@/components/brand/strategy/PlanGrid";
import { StrategyScorecardTab } from "@/components/brand/strategy/StrategyScorecardTab";
import { StrategyKpiEditor, type StrategyKpiRow } from "@/components/brand/strategy/StrategyKpiEditor";
import { useAdminConfirmAction } from "@/hooks/useAdminConfirmAction";
import { brandButtonPrimaryClass } from "@/routes/brand/brandTypes";
import { cn } from "@/lib/cn";

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

type StrategyTab = "plan" | "scorecard";

const SECTION_NAV = [
  { id: "strategy-positioning", label: "Positioning" },
  { id: "strategy-pillars", label: "Pillars" },
  { id: "strategy-plans", label: "Quarterly plans" },
  { id: "strategy-kpis", label: "KPI targets" },
] as const;

function statusBadge(s: StrategyRow): { label: string; className: string } {
  if (s.archived_at) return { label: "Archived", className: "bg-zinc-100 text-zinc-600" };
  if (s.status === "approved") return { label: "Approved", className: "bg-emerald-100 text-emerald-800" };
  return { label: "Draft", className: "bg-amber-100 text-amber-900" };
}

export function BrandStrategyPage() {
  useAdminDocumentTitle("Brand strategy");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const [searchParams, setSearchParams] = useSearchParams();
  const includeArchived = searchParams.get("archived") === "1";
  const tab: StrategyTab = searchParams.get("tab") === "scorecard" ? "scorecard" : "plan";
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
      setSearchParams({ year: String(year), tab: "plan" });
      void q.refetch();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["brand-strategy"] });

  const setYear = (year: number) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("year", String(year));
      return p;
    });
  };

  const setTab = (next: StrategyTab) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("tab", next);
      return p;
    });
  };

  if (denied) return denied;
  if (q.isLoading) return <AdminPageSkeleton rows={4} />;
  if (q.error) return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;

  const currentCalendarYear = new Date().getFullYear();

  return (
    <div className="space-y-4">
      <ConfirmDialog />
      <AdminPageHeader
        title="Strategy"
        description="Pillars, quarterly plans, KPI scorecard and approval."
        actions={
          <button
            type="button"
            className={brandButtonPrimaryClass}
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

      {items.length === 0 ? (
        <EmptyState
          title="No strategy yet"
          description={`Start with a draft for ${currentCalendarYear}.`}
          action={
            <button
              type="button"
              className={brandButtonPrimaryClass}
              disabled={createMut.isPending}
              onClick={() => createMut.mutate(currentCalendarYear)}
            >
              Create {currentCalendarYear} strategy
            </button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 pb-3">
            <div
              className="inline-flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-gray-50/80 p-1"
              role="tablist"
              aria-label="Strategy year"
            >
              {items.map((s) => {
                const badge = statusBadge(s);
                const active = selected?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                      active ? "bg-white font-medium text-gray-900 shadow-sm" : "text-gray-600 hover:bg-white/60",
                    )}
                    onClick={() => setYear(s.year)}
                  >
                    {s.year}
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium uppercase", badge.className)}>
                      {badge.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <label className="ml-auto flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => {
                  setSearchParams((prev) => {
                    const p = new URLSearchParams(prev);
                    if (e.target.checked) p.set("archived", "1");
                    else p.delete("archived");
                    return p;
                  });
                }}
              />
              Show archived
            </label>
          </div>

          {selected ? (
            <>
              <StrategyStatusBar strategyId={selected.id} status={selected.status} locked={locked} onChanged={refresh} />

              {locked ? (
                <div
                  role="status"
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                >
                  {selected.archived_at
                    ? "This strategy year is archived and read-only."
                    : "Approved strategies are read-only. Revert to draft in the status bar to edit pillars and plans."}
                </div>
              ) : null}

              <div className="flex gap-2" role="tablist" aria-label="Strategy views">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "plan"}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm",
                    tab === "plan" ? "bg-zinc-900 text-white" : "border border-gray-200 text-zinc-600 hover:bg-zinc-50",
                  )}
                  onClick={() => setTab("plan")}
                >
                  Plan
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "scorecard"}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm",
                    tab === "scorecard" ? "bg-zinc-900 text-white" : "border border-gray-200 text-zinc-600 hover:bg-zinc-50",
                  )}
                  onClick={() => setTab("scorecard")}
                >
                  Scorecard
                </button>
              </div>

              {tab === "scorecard" ? (
                <StrategyScorecardTab strategyId={selected.id} />
              ) : (
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <nav
                    className="hidden shrink-0 lg:block lg:w-44 lg:sticky lg:top-[7.5rem] lg:self-start"
                    aria-label="On this page"
                  >
                    <ul className="space-y-1 text-sm">
                      {SECTION_NAV.map((s) => (
                        <li key={s.id}>
                          <a href={`#${s.id}`} className="block rounded-lg px-2 py-1 text-gray-600 hover:bg-gray-100 hover:text-gray-900">
                            {s.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                  <div className="min-w-0 flex-1 space-y-4">
                    <div id="strategy-positioning">
                      <AdminPanel title={`${selected.year} strategy`}>
                        <StrategyHeaderForm
                          positioning={selected.positioning ?? ""}
                          brandPromise={selected.brand_promise ?? ""}
                          notes={selected.notes ?? ""}
                          locked={locked}
                          onSave={(patch) => patchMut.mutate(patch)}
                        />
                      </AdminPanel>
                    </div>
                    <div id="strategy-pillars">
                      <AdminPanel title="Pillars">
                        <PillarList
                          strategyId={selected.id}
                          pillars={selected.brand_pillars ?? []}
                          locked={locked}
                          onChanged={refresh}
                        />
                      </AdminPanel>
                    </div>
                    <div id="strategy-plans">
                      <AdminPanel title="Quarterly plans">
                        <PlanGrid
                          strategyYear={selected.year}
                          pillars={selected.brand_pillars ?? []}
                          locked={locked}
                          onChanged={refresh}
                        />
                      </AdminPanel>
                    </div>
                    <div id="strategy-kpis">
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
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
