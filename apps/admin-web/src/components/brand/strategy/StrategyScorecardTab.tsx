import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { AdminPanel } from "@/components/ui/AdminPanel";

const STATUS_COLOR: Record<string, string> = {
  achieved: "text-emerald-700",
  on_track: "text-emerald-600",
  at_risk: "text-amber-700",
  off_track: "text-red-700",
  not_started: "text-zinc-400",
  no_data: "text-zinc-500",
};

export function StrategyScorecardTab({ strategyId }: { strategyId: string }) {
  const catalogQ = useQuery({
    queryKey: ["brand-kpi-catalog"],
    queryFn: () => adminApi.getJson<{ items: Array<{ key: string; label: string }> }>("/api/admin/brand/kpis/catalog"),
  });
  const labelByKey = new Map((catalogQ.data?.items ?? []).map((c) => [c.key, c.label]));

  const q = useQuery({
    queryKey: ["brand-strategy-scorecard", strategyId],
    queryFn: () =>
      adminApi.getJson<{
        health_score: number;
        status_counts: Record<string, number>;
        kpis: Array<{ kpi_key: string; target: number; actual: number; expected_to_date: number; status: string }>;
      }>(`/api/admin/brand/strategy/${strategyId}/scorecard`),
  });

  if (q.isLoading) return <p className="text-sm text-zinc-500">Loading scorecard…</p>;
  if (!q.data) return null;

  return (
    <div className="space-y-4">
      <AdminPanel title={`Health score: ${q.data.health_score}`}>
        <p className="text-sm text-zinc-600">
          On track: {q.data.status_counts.on_track ?? 0} · At risk: {q.data.status_counts.at_risk ?? 0} · Off track:{" "}
          {q.data.status_counts.off_track ?? 0}
        </p>
      </AdminPanel>
      <ul className="space-y-2">
        {q.data.kpis.map((row) => (
          <li key={row.kpi_key} className="rounded border p-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{labelByKey.get(row.kpi_key) ?? row.kpi_key}</span>
              <span className={STATUS_COLOR[row.status] ?? ""}>{row.status.replace(/_/g, " ")}</span>
            </div>
            <div className="mt-1 h-2 rounded bg-zinc-100">
              <div
                className="h-2 rounded bg-violet-500"
                style={{ width: `${Math.min(100, row.target > 0 ? (row.actual / row.target) * 100 : 0)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {row.actual} / {row.target} (expected to date: {row.expected_to_date})
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
