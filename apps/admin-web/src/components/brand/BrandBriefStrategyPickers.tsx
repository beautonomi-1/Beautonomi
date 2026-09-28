import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { adminApi } from "@/lib/adminClient";
import { adminSpaTo } from "@/lib/adminSpaPath";

type PillarRow = { id: string; name: string; archived_at?: string | null; brand_plans?: PlanRow[] };
type PlanRow = { id: string; year: number; quarter: number; archived_at?: string | null };
type StrategyRow = {
  id: string;
  year: number;
  status: string;
  archived_at?: string | null;
  brand_pillars?: PillarRow[];
};

type Props = {
  pillarId: string;
  planId: string;
  onPillarChange: (pillarId: string) => void;
  onPlanChange: (planId: string) => void;
  disabled?: boolean;
};

export function BrandBriefStrategyPickers({
  pillarId,
  planId,
  onPillarChange,
  onPlanChange,
  disabled,
}: Props) {
  const strategyQ = useQuery({
    queryKey: ["brand-strategy"],
    queryFn: () => adminApi.getJson<{ items: StrategyRow[] }>("/api/admin/brand/strategy"),
  });

  const pillars = useMemo(() => {
    const items = (strategyQ.data?.items ?? []).filter((s) => !s.archived_at);
    const active = items.flatMap((s) =>
      (s.brand_pillars ?? [])
        .filter((p) => !p.archived_at)
        .map((p) => ({ ...p, strategyYear: s.year, strategyStatus: s.status })),
    );
    if (pillarId && !active.some((p) => p.id === pillarId)) {
      const found = (strategyQ.data?.items ?? []).flatMap((s) =>
        (s.brand_pillars ?? []).map((p) => ({ ...p, strategyYear: s.year, strategyStatus: s.status })),
      ).find((p) => p.id === pillarId);
      if (found) {
        active.unshift({ ...found, name: `${found.name} (archived)`, strategyStatus: "archived" });
      }
    }
    return active;
  }, [strategyQ.data?.items, pillarId, planId]);

  const plans = useMemo(() => {
    const pillar = pillars.find((p) => p.id === pillarId);
    const list = (pillar?.brand_plans ?? []).filter((pl) => !pl.archived_at);
    if (planId && !list.some((pl) => pl.id === planId)) {
      const archived = (strategyQ.data?.items ?? [])
        .flatMap((s) => s.brand_pillars ?? [])
        .flatMap((p) => p.brand_plans ?? [])
        .find((pl) => pl.id === planId);
      if (archived) list.push({ ...archived, quarter: archived.quarter, year: archived.year });
    }
    return list;
  }, [pillars, pillarId, planId, strategyQ.data?.items]);

  if (strategyQ.isLoading) {
    return <p className="text-xs text-zinc-500">Loading strategy…</p>;
  }

  if (pillars.length === 0) {
    return (
      <p className="text-sm text-amber-800">
        No pillars yet.{" "}
        <Link to={adminSpaTo("/admin/brand/strategy")} className="font-medium underline">
          Add pillars on Strategy
        </Link>{" "}
        before linking this brief.
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block">
        <span className="text-zinc-600">Strategy pillar</span>
        <select
          className="mt-1 w-full rounded border px-2 py-1.5"
          disabled={disabled}
          value={pillarId}
          onChange={(e) => {
            onPillarChange(e.target.value);
            onPlanChange("");
          }}
        >
          <option value="">Select pillar…</option>
          {pillars.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.strategyYear}{p.strategyStatus !== "approved" ? ` · ${p.strategyStatus}` : ""})
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-zinc-600">Quarterly plan</span>
        <select
          className="mt-1 w-full rounded border px-2 py-1.5"
          disabled={disabled || !pillarId}
          value={planId}
          onChange={(e) => onPlanChange(e.target.value)}
        >
          <option value="">Select plan…</option>
          {plans.map((pl) => (
            <option key={pl.id} value={pl.id}>
              {pl.year} Q{pl.quarter}
            </option>
          ))}
        </select>
        {pillarId && plans.length === 0 ? (
          <span className="mt-1 block text-xs text-zinc-500">No plans on this pillar yet.</span>
        ) : null}
      </label>
    </div>
  );
}
