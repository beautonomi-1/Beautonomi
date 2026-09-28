import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import type { BrandPlacementRow } from "@/routes/brand/BrandPlacementForm";

type MetricEntry = {
  id: string;
  placement_id: string;
  placement_name: string;
  metric_key: string;
  value: number;
  unit: string;
  as_of: string;
  original_currency: string | null;
  original_amount: number | null;
  converted_amount: number | null;
  confidence: string;
  source: string;
  voided: boolean;
  void_reason: string | null;
  supersedes_id: string | null;
  created_at: string;
};

const METRIC_KEYS = ["spend", "impressions", "clicks", "reach", "sends", "recipient_count"] as const;

export function BrandAdvancedMetricsPanel({
  campaignId,
  period,
  placements,
}: {
  campaignId: string;
  period: string;
  placements: BrandPlacementRow[];
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const listQ = useQuery({
    queryKey: [...adminQueryKeys.brandCampaign(campaignId, period), "metric-entries"],
    queryFn: () =>
      adminApi.getJson<{ items: MetricEntry[] }>(
        `/api/admin/brand/campaigns/${campaignId}/metrics?period=${encodeURIComponent(period)}`,
      ),
  });

  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctValue, setCorrectValue] = useState("");

  const [draft, setDraft] = useState({
    placement_id: placements[0]?.id ?? "",
    metric_key: "spend" as string,
    value: "",
    as_of: today,
    original_currency: "",
    original_amount: "",
    confidence: "entered" as string,
  });

  const saveMut = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/brand/metrics", {
        entries: [
          {
            placement_id: draft.placement_id,
            metric_key: draft.metric_key,
            value: Number(draft.value),
            unit: draft.metric_key === "spend" ? "currency" : "count",
            as_of: draft.as_of,
            original_currency: draft.original_currency || undefined,
            original_amount: draft.original_amount ? Number(draft.original_amount) : undefined,
            confidence: draft.confidence,
            source: "entered",
          },
        ],
      }),
    onSuccess: () => {
      adminToast.success("Metric saved");
      void listQ.refetch();
      void qc.invalidateQueries({ queryKey: adminQueryKeys.brandCampaign(campaignId, period) });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const voidMut = useMutation({
    mutationFn: (entry: MetricEntry) =>
      adminApi.postJson("/api/admin/brand/metrics", {
        entries: [
          {
            placement_id: entry.placement_id,
            metric_key: entry.metric_key,
            value: 0,
            unit: entry.unit,
            as_of: entry.as_of,
            voided: true,
            void_reason: "Voided from admin",
            supersedes_id: entry.id,
            source: "entered",
            confidence: entry.confidence,
          },
        ],
      }),
    onSuccess: () => {
      adminToast.success("Entry voided");
      void listQ.refetch();
      void qc.invalidateQueries({ queryKey: adminQueryKeys.brandCampaign(campaignId, period) });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const correctMut = useMutation({
    mutationFn: (input: { entry: MetricEntry; newValue: number }) =>
      adminApi.postJson("/api/admin/brand/metrics", {
        entries: [
          {
            placement_id: input.entry.placement_id,
            metric_key: input.entry.metric_key,
            value: input.newValue,
            unit: input.entry.unit,
            as_of: input.entry.as_of,
            supersedes_id: input.entry.id,
            source: "entered",
            confidence: "entered",
          },
        ],
      }),
    onSuccess: () => {
      adminToast.success("Correction saved");
      setCorrectingId(null);
      setCorrectValue("");
      void listQ.refetch();
      void qc.invalidateQueries({ queryKey: adminQueryKeys.brandCampaign(campaignId, period) });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  if (listQ.isLoading) return <AdminPageSkeleton rows={4} />;
  if (listQ.error) return <AdminRetryBlock message={listQ.error.message} onRetry={() => void listQ.refetch()} />;

  const items = listQ.data?.items ?? [];

  return (
    <div className="space-y-4">
      <AdminPanel title="Enter metric (FX & corrections)">
        {placements.length === 0 ? (
          <p className="text-sm text-zinc-500">Add a placement first.</p>
        ) : (
          <form
            className="grid gap-3 md:grid-cols-3 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.placement_id || !draft.value) return;
              saveMut.mutate();
            }}
          >
            <label className="block">
              Placement
              <select
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={draft.placement_id}
                onChange={(e) => setDraft((d) => ({ ...d, placement_id: e.target.value }))}
              >
                {placements.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name ?? p.channel_key}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Metric
              <select
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={draft.metric_key}
                onChange={(e) => setDraft((d) => ({ ...d, metric_key: e.target.value }))}
              >
                {METRIC_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Value (reporting)
              <input
                type="number"
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={draft.value}
                onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
                required
              />
            </label>
            <label className="block">
              As of
              <input
                type="date"
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={draft.as_of}
                onChange={(e) => setDraft((d) => ({ ...d, as_of: e.target.value }))}
              />
            </label>
            <label className="block">
              Original currency
              <input
                className="mt-1 w-full rounded border px-2 py-1.5"
                placeholder="USD"
                value={draft.original_currency}
                onChange={(e) => setDraft((d) => ({ ...d, original_currency: e.target.value }))}
              />
            </label>
            <label className="block">
              Original amount
              <input
                type="number"
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={draft.original_amount}
                onChange={(e) => setDraft((d) => ({ ...d, original_amount: e.target.value }))}
              />
            </label>
            <label className="block">
              Confidence
              <select
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={draft.confidence}
                onChange={(e) => setDraft((d) => ({ ...d, confidence: e.target.value }))}
              >
                {["entered", "estimated", "measured", "unattributable"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end md:col-span-3">
              <button
                type="submit"
                disabled={saveMut.isPending}
                className="rounded bg-violet-700 px-3 py-1.5 text-white disabled:opacity-50"
              >
                Save entry
              </button>
            </div>
          </form>
        )}
      </AdminPanel>

      <AdminPanel title={`Entries in period (${items.length})`}>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">No entries in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b text-zinc-500">
                  <th className="py-2 pr-2">Placement</th>
                  <th className="py-2 pr-2">Key</th>
                  <th className="py-2 pr-2">Value</th>
                  <th className="py-2 pr-2">FX</th>
                  <th className="py-2 pr-2">As of</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} className="border-b border-zinc-100">
                    <td className="py-2 pr-2">{e.placement_name}</td>
                    <td className="py-2 pr-2">{e.metric_key}</td>
                    <td className="py-2 pr-2 tabular-nums">{e.value}</td>
                    <td className="py-2 pr-2">
                      {e.original_currency
                        ? `${e.original_amount} ${e.original_currency} → ${e.converted_amount ?? "—"}`
                        : "—"}
                    </td>
                    <td className="py-2 pr-2">{e.as_of}</td>
                    <td className="py-2 pr-2">{e.voided ? "void" : e.confidence}</td>
                    <td className="py-2 pr-2">
                      {!e.voided && (
                        <div className="flex flex-wrap items-center gap-2">
                          {correctingId === e.id ? (
                            <>
                              <input
                                type="number"
                                className="w-20 rounded border px-1 py-0.5"
                                value={correctValue}
                                onChange={(ev) => setCorrectValue(ev.target.value)}
                              />
                              <button
                                type="button"
                                className="text-violet-700"
                                onClick={() => {
                                  const n = Number(correctValue);
                                  if (Number.isNaN(n)) {
                                    adminToast.error("Enter a valid number");
                                    return;
                                  }
                                  correctMut.mutate({ entry: e, newValue: n });
                                }}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="text-zinc-500"
                                onClick={() => {
                                  setCorrectingId(null);
                                  setCorrectValue("");
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="text-violet-700"
                                onClick={() => {
                                  setCorrectingId(e.id);
                                  setCorrectValue(String(e.value));
                                }}
                              >
                                Correct
                              </button>
                              <button type="button" className="text-red-700" onClick={() => voidMut.mutate(e)}>
                                Void
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
