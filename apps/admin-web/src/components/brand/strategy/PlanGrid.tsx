import { useMutation } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";
import type { PillarRow } from "./PillarList";

type PlanRow = { id: string; quarter: number; budget?: number; objective?: string | null };

type Props = {
  strategyYear: number;
  pillars: Array<PillarRow & { brand_plans?: PlanRow[] }>;
  locked: boolean;
  onChanged: () => void;
};

export function PlanGrid({ strategyYear, pillars, locked, onChanged }: Props) {
  const planMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (body.id) return adminApi.patchJson(`/api/admin/brand/strategy/plans/${body.id}`, body.patch as object);
      return adminApi.postJson("/api/admin/brand/strategy/plans", body);
    },
    onSuccess: () => onChanged(),
    onError: (e: Error) => adminToast.error(e.message),
  });

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-left text-zinc-500">
            <th className="py-2 pr-4">Pillar</th>
            {[1, 2, 3, 4].map((q) => (
              <th key={q} className="py-2 pr-4">
                Q{q}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pillars.map((p) => (
            <tr key={p.id} className="border-b border-zinc-100 align-top">
              <td className="py-2 pr-4 font-medium">{p.name}</td>
              {[1, 2, 3, 4].map((q) => {
                const plan = (p.brand_plans ?? []).find((pl) => pl.quarter === q);
                return (
                  <td key={q} className="py-2 pr-4">
                    {plan ? (
                      <input
                        type="number"
                        className="w-24 rounded border px-1 py-0.5"
                        disabled={locked}
                        defaultValue={plan.budget ?? 0}
                        onBlur={(e) =>
                          planMut.mutate({
                            id: plan.id,
                            patch: { budget: Number(e.target.value) },
                          })
                        }
                      />
                    ) : locked ? (
                      <span className="text-zinc-300">—</span>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-violet-700"
                        onClick={() =>
                          planMut.mutate({
                            pillar_id: p.id,
                            year: strategyYear,
                            quarter: q,
                            budget: 0,
                          })
                        }
                      >
                        + plan
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
