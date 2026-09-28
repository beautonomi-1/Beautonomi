import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { adminApi } from "@/lib/adminClient";
import { adminSpaTo } from "@/lib/adminSpaPath";

type PillarRow = { id: string; name: string; brand_plans?: PlanRow[] };
type PlanRow = { id: string; year: number; quarter: number };
type StrategyRow = { id: string; year: number; brand_pillars?: PillarRow[] };

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
    const items = strategyQ.data?.items ?? [];
    return items.flatMap((s) =>
      (s.brand_pillars ?? []).map((p) => ({ ...p, strategyYear: s.year })),
    );
  }, [strategyQ.data?.items]);

  const plans = useMemo(() => {
    const pillar = pillars.find((p) => p.id === pillarId);
    return pillar?.brand_plans ?? [];
  }, [pillars, pillarId]);

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
              {p.name} ({p.strategyYear})
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
