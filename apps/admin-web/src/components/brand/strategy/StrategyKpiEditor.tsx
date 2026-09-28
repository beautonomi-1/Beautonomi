import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";

export type StrategyKpiRow = {
  id: string;
  kpi_key: string;
  target: number;
  weight: number;
  baseline: number | null;
  pillar_id: string | null;
  plan_id: string | null;
  archived_at?: string | null;
};

type PillarOption = { id: string; name: string; brand_plans?: Array<{ id: string; quarter: number }> };

type Props = {
  strategyId: string;
  year: number;
  kpis: StrategyKpiRow[];
  pillars: PillarOption[];
  locked: boolean;
  onChanged: () => void;
};

type CatalogEntry = { key: string; label: string; unit: string };

function scopeLabel(kpi: StrategyKpiRow, pillars: PillarOption[], year: number): string {
  if (kpi.plan_id) {
    for (const p of pillars) {
      const pl = p.brand_plans?.find((x) => x.id === kpi.plan_id);
      if (pl) return `${p.name} · Q${pl.quarter} ${year}`;
    }
    return "Plan";
  }
  if (kpi.pillar_id) {
    const p = pillars.find((x) => x.id === kpi.pillar_id);
    return p ? p.name : "Pillar";
  }
  return "Strategy (year)";
}

export function StrategyKpiEditor({ strategyId, year, kpis, pillars, locked, onChanged }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({
    kpi_key: "",
    pillar_id: "",
    plan_id: "",
    target: "",
    weight: "1",
    baseline: "",
  });

  const catalogQ = useQuery({
    queryKey: ["brand-kpi-catalog"],
    queryFn: () => adminApi.getJson<{ items: CatalogEntry[] }>("/api/admin/brand/kpis/catalog"),
  });
  const catalog = catalogQ.data?.items ?? [];
  const labelByKey = useMemo(() => new Map(catalog.map((c) => [c.key, c.label])), [catalog]);

  const activeKpis = kpis.filter((k) => !k.archived_at);

  const patchMut = useMutation({
    mutationFn: (input: { id: string; patch: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/brand/strategy/kpis/${input.id}`, input.patch),
    onSuccess: () => onChanged(),
    onError: (e: Error) => adminToast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/brand/strategy/kpis", {
        strategy_id: strategyId,
        kpi_key: draft.kpi_key,
        pillar_id: draft.pillar_id || null,
        plan_id: draft.plan_id || null,
        target: Number(draft.target),
        weight: Number(draft.weight) || 1,
        baseline: draft.baseline.trim() ? Number(draft.baseline) : null,
      }),
    onSuccess: () => {
      adminToast.success("KPI target added");
      setShowAdd(false);
      setDraft({ kpi_key: "", pillar_id: "", plan_id: "", target: "", weight: "1", baseline: "" });
      onChanged();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const plansForPillar = useMemo(() => {
    if (!draft.pillar_id) return [];
    return pillars.find((p) => p.id === draft.pillar_id)?.brand_plans ?? [];
  }, [draft.pillar_id, pillars]);

  return (
    <div className="space-y-3 text-sm">
      {!locked && !showAdd ? (
        <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => setShowAdd(true)}>
          Add KPI target
        </button>
      ) : null}

      {showAdd && !locked ? (
        <div className="rounded border bg-zinc-50 p-3 space-y-2">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="block md:col-span-2">
              KPI
              <select
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={draft.kpi_key}
                onChange={(e) => setDraft((d) => ({ ...d, kpi_key: e.target.value }))}
              >
                <option value="">Select…</option>
                {catalog.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label} ({c.unit})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Pillar (optional)
              <select
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={draft.pillar_id}
                onChange={(e) => setDraft((d) => ({ ...d, pillar_id: e.target.value, plan_id: "" }))}
              >
                <option value="">Whole strategy</option>
                {pillars.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Quarter plan (optional)
              <select
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={draft.plan_id}
                disabled={!draft.pillar_id}
                onChange={(e) => setDraft((d) => ({ ...d, plan_id: e.target.value }))}
              >
                <option value="">—</option>
                {plansForPillar.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    Q{pl.quarter}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Target
              <input
                type="number"
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={draft.target}
                onChange={(e) => setDraft((d) => ({ ...d, target: e.target.value }))}
              />
            </label>
            <label className="block">
              Weight (1–10)
              <input
                type="number"
                min={1}
                max={10}
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={draft.weight}
                onChange={(e) => setDraft((d) => ({ ...d, weight: e.target.value }))}
              />
            </label>
            <label className="block md:col-span-2">
              Baseline (optional)
              <input
                type="number"
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={draft.baseline}
                onChange={(e) => setDraft((d) => ({ ...d, baseline: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded bg-violet-700 px-3 py-1.5 text-white disabled:opacity-50"
              disabled={!draft.kpi_key || !draft.target.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Save target
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1.5"
              onClick={() => {
                setShowAdd(false);
                setDraft({ kpi_key: "", pillar_id: "", plan_id: "", target: "", weight: "1", baseline: "" });
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {activeKpis.length === 0 ? (
        <p className="text-zinc-500">No KPI targets yet. Add targets to drive the scorecard and pacing alerts.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b text-xs text-zinc-500">
                <th className="py-2 pr-2">KPI</th>
                <th className="py-2 pr-2">Scope</th>
                <th className="py-2 pr-2">Target</th>
                <th className="py-2 pr-2">Weight</th>
                <th className="py-2 pr-2">Baseline</th>
                {!locked ? <th className="py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {activeKpis.map((k) => (
                <KpiRowEditor
                  key={k.id}
                  kpi={k}
                  label={labelByKey.get(k.kpi_key) ?? k.kpi_key}
                  scope={scopeLabel(k, pillars, year)}
                  locked={locked}
                  onPatch={(patch) => patchMut.mutate({ id: k.id, patch })}
                  onArchive={() => patchMut.mutate({ id: k.id, patch: { archived: true } })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiRowEditor({
  kpi,
  label,
  scope,
  locked,
  onPatch,
  onArchive,
}: {
  kpi: StrategyKpiRow;
  label: string;
  scope: string;
  locked: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onArchive: () => void;
}) {
  const [target, setTarget] = useState(String(kpi.target));
  const [weight, setWeight] = useState(String(kpi.weight));
  const [baseline, setBaseline] = useState(kpi.baseline != null ? String(kpi.baseline) : "");

  const commit = () => {
    const t = Number(target);
    const w = Number(weight);
    if (!Number.isFinite(t) || !Number.isFinite(w)) return;
    onPatch({
      target: t,
      weight: w,
      baseline: baseline.trim() ? Number(baseline) : null,
    });
  };

  return (
    <tr className="border-b last:border-b-0">
      <td className="py-2 pr-2 font-medium">{label}</td>
      <td className="py-2 pr-2 text-zinc-600">{scope}</td>
      <td className="py-2 pr-2">
        <input
          type="number"
          className="w-24 rounded border px-2 py-1"
          disabled={locked}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onBlur={commit}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          min={1}
          max={10}
          className="w-16 rounded border px-2 py-1"
          disabled={locked}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={commit}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          className="w-24 rounded border px-2 py-1"
          disabled={locked}
          value={baseline}
          onChange={(e) => setBaseline(e.target.value)}
          onBlur={commit}
        />
      </td>
      {!locked ? (
        <td className="py-2">
          <button type="button" className="text-xs text-red-600" onClick={onArchive}>
            Archive
          </button>
        </td>
      ) : null}
    </tr>
  );
}
