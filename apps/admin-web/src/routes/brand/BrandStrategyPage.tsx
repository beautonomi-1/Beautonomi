import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { adminToast } from "@/lib/adminToast";

type PlanRow = { id: string; year: number; quarter: number; budget?: number };
type PillarRow = { id: string; name: string; brand_plans?: PlanRow[] };
type StrategyRow = { id: string; year: number; status: string; positioning?: string; brand_promise?: string; brand_pillars?: PillarRow[] };

function StrategyYearPanel({ strategy }: { strategy: StrategyRow }) {
  const qc = useQueryClient();
  const [pillarName, setPillarName] = useState("");
  const [planPillarId, setPlanPillarId] = useState("");
  const [planQuarter, setPlanQuarter] = useState("1");

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["brand-strategy"] });

  const pillarMut = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/brand/strategy/pillars", {
        strategy_id: strategy.id,
        name: pillarName.trim(),
      }),
    onSuccess: () => {
      setPillarName("");
      adminToast.success("Pillar added");
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const planMut = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/brand/strategy/plans", {
        pillar_id: planPillarId,
        year: strategy.year,
        quarter: Number(planQuarter),
      }),
    onSuccess: () => {
      adminToast.success("Plan added");
      invalidate();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const pillars = strategy.brand_pillars ?? [];

  return (
    <AdminPanel title={`${strategy.year} — ${strategy.status}`}>
      <p className="text-sm">{strategy.positioning ?? "—"}</p>
      <p className="mt-1 text-xs text-zinc-500">Promise: {strategy.brand_promise ?? "—"}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          className="rounded border px-2 py-1.5 text-sm"
          placeholder="New pillar name"
          value={pillarName}
          onChange={(e) => setPillarName(e.target.value)}
        />
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          disabled={!pillarName.trim() || pillarMut.isPending}
          onClick={() => pillarMut.mutate()}
        >
          Add pillar
        </button>
      </div>

      <ul className="mt-4 space-y-3 text-sm">
        {pillars.map((p) => (
          <li key={p.id} className="rounded border border-zinc-100 p-3">
            <p className="font-medium">{p.name}</p>
            <ul className="mt-1 text-xs text-zinc-600">
              {(p.brand_plans ?? []).map((pl) => (
                <li key={pl.id}>
                  {pl.year} Q{pl.quarter}
                  {pl.budget != null ? ` · budget ${pl.budget}` : ""}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {pillars.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t pt-3">
          <label className="text-sm">
            <span className="text-zinc-600">Pillar</span>
            <select
              className="ml-2 rounded border px-2 py-1"
              value={planPillarId}
              onChange={(e) => setPlanPillarId(e.target.value)}
            >
              <option value="">Select…</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-zinc-600">Quarter</span>
            <select className="ml-2 rounded border px-2 py-1" value={planQuarter} onChange={(e) => setPlanQuarter(e.target.value)}>
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={String(q)}>
                  Q{q}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={!planPillarId || planMut.isPending}
            onClick={() => planMut.mutate()}
          >
            Add quarterly plan
          </button>
        </div>
      ) : null}
    </AdminPanel>
  );
}

export function BrandStrategyPage() {
  useAdminDocumentTitle("Brand strategy");
  const { denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");

  const q = useQuery({
    queryKey: ["brand-strategy"],
    queryFn: () => adminApi.getJson<{ items: StrategyRow[] }>("/api/admin/brand/strategy"),
  });

  const createMut = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/brand/strategy", {
        year: new Date().getFullYear(),
        positioning: "Draft positioning",
      }),
    onSuccess: () => {
      adminToast.success("Strategy year created");
      void q.refetch();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (denied) return denied;
  if (q.isLoading) return <AdminPageSkeleton rows={4} />;

  const items = q.data?.items ?? [];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Strategy"
        description="Link briefs and campaigns to pillars and quarterly plans."
        actions={
          <button type="button" className="rounded bg-violet-700 px-3 py-1.5 text-sm text-white" onClick={() => createMut.mutate()}>
            Add year
          </button>
        }
      />
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No strategy yet. Add a year, then pillars and plans for brief linking.</p>
      ) : (
        items.map((s) => <StrategyYearPanel key={s.id} strategy={s} />)
      )}
    </div>
  );
}
