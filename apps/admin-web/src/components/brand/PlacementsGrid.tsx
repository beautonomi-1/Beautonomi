import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { channelLabel } from "@/routes/brand/brandChannels";
import type { BrandPlacementRow } from "@/routes/brand/BrandPlacementForm";

type AdminOption = { id: string; name: string; email: string | null };

type Props = {
  campaignId: string;
  defaultTrackingCode: string;
  campaignFlightStart: string;
  campaignFlightEnd: string;
  budgetEnvelope: number | null;
  placements: BrandPlacementRow[];
  onRefresh: () => void;
};

function missingFields(p: BrandPlacementRow): string[] {
  const m: string[] = [];
  if (!p.owner_id) m.push("owner");
  if (!p.flight_start) m.push("start");
  if (!p.flight_end) m.push("end");
  if (p.budget == null) m.push("budget");
  return m;
}

export function PlacementsGrid({
  campaignId,
  defaultTrackingCode,
  campaignFlightStart,
  campaignFlightEnd,
  budgetEnvelope,
  placements,
  onRefresh,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const adminsQ = useQuery({
    queryKey: [...adminQueryKeys.root, "brand", "marketing-admins"],
    queryFn: () => adminApi.getJson<{ items: AdminOption[] }>("/api/admin/brand/marketing-admins"),
  });
  const admins = adminsQ.data?.items ?? [];

  const patchMut = useMutation({
    mutationFn: (input: { id: string; patch: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/brand/placements/${input.id}`, input.patch),
    onSuccess: () => {
      adminToast.success("Saved");
      onRefresh();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const bulkMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.postJson(`/api/admin/brand/campaigns/${campaignId}/placements/bulk`, body),
    onSuccess: () => {
      adminToast.success("Bulk update applied");
      setSelected(new Set());
      onRefresh();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const allIds = useMemo(() => placements.map((p) => p.id), [placements]);

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs"
          onClick={() => bulkMut.mutate({ action: "apply_campaign_dates", placement_ids: allIds })}
          disabled={!campaignFlightStart || bulkMut.isPending}
        >
          Apply campaign dates to all
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs"
          onClick={() =>
            bulkMut.mutate({
              action: "split_budget_even",
              placement_ids: selected.size ? [...selected] : allIds,
              envelope: budgetEnvelope ?? 0,
            })
          }
          disabled={bulkMut.isPending || !budgetEnvelope}
        >
          Split budget evenly
        </button>
        {admins[0] && (
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() =>
              bulkMut.mutate({
                action: "assign_owner",
                placement_ids: selected.size ? [...selected] : allIds,
                owner_id: admins[0]!.id,
              })
            }
            disabled={bulkMut.isPending}
          >
            Assign owner (first admin)
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="p-2">
                <input
                  type="checkbox"
                  checked={selected.size === placements.length && placements.length > 0}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(allIds) : new Set())
                  }
                />
              </th>
              <th className="p-2">Line</th>
              <th className="p-2">Owner</th>
              <th className="p-2">Start</th>
              <th className="p-2">End</th>
              <th className="p-2">Budget</th>
              <th className="p-2">Code</th>
            </tr>
          </thead>
          <tbody>
            {placements.map((p) => {
              const miss = missingFields(p);
              return (
                <tr key={p.id} className={miss.length ? "bg-amber-50/50" : ""}>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="p-2 font-medium">
                    {p.name ?? channelLabel(p.channel_key)}
                    {miss.length ? (
                      <span className="ml-1 text-amber-700">({miss.join(", ")})</span>
                    ) : null}
                  </td>
                  <td className="p-2">
                    <select
                      className="w-full max-w-[140px] rounded border px-1 py-0.5"
                      value={p.owner_id ?? ""}
                      onChange={(e) =>
                        patchMut.mutate({
                          id: p.id,
                          patch: { owner_id: e.target.value || undefined },
                        })
                      }
                    >
                      <option value="">—</option>
                      {admins.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      type="date"
                      className="rounded border px-1 py-0.5"
                      value={(p.flight_start ?? "").slice(0, 10)}
                      onChange={(e) =>
                        patchMut.mutate({ id: p.id, patch: { flight_start: e.target.value || null } })
                      }
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="date"
                      className="rounded border px-1 py-0.5"
                      value={(p.flight_end ?? "").slice(0, 10)}
                      onChange={(e) =>
                        patchMut.mutate({ id: p.id, patch: { flight_end: e.target.value || null } })
                      }
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      className="w-20 rounded border px-1 py-0.5"
                      value={p.budget ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        patchMut.mutate({
                          id: p.id,
                          patch: { budget: v === "" ? null : Number(v) },
                        });
                      }}
                    />
                  </td>
                  <td className="p-2 font-mono text-[10px]">{p.tracking_code ?? defaultTrackingCode}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
