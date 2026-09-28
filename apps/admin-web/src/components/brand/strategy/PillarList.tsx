import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";

export type PillarRow = {
  id: string;
  name: string;
  description?: string | null;
  budget_target?: number | null;
  sort_order?: number;
};

type Props = {
  strategyId: string;
  pillars: PillarRow[];
  locked: boolean;
  onChanged: () => void;
};

export function PillarList({ strategyId, pillars, locked, onChanged }: Props) {
  const [newPillarName, setNewPillarName] = useState("");
  const [showAddPillar, setShowAddPillar] = useState(false);

  const patchMut = useMutation({
    mutationFn: (input: { id: string; patch: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/brand/strategy/pillars/${input.id}`, input.patch),
    onSuccess: () => onChanged(),
    onError: (e: Error) => adminToast.error(e.message),
  });

  const addMut = useMutation({
    mutationFn: (name: string) =>
      adminApi.postJson("/api/admin/brand/strategy/pillars", { strategy_id: strategyId, name }),
    onSuccess: () => {
      adminToast.success("Pillar added");
      setNewPillarName("");
      setShowAddPillar(false);
      onChanged();
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {!locked ? (
        <div className="flex flex-wrap items-end gap-2">
          {showAddPillar ? (
            <>
              <input
                className="rounded border px-2 py-1.5 text-sm"
                placeholder="Pillar name"
                value={newPillarName}
                onChange={(e) => setNewPillarName(e.target.value)}
              />
              <button
                type="button"
                className="rounded bg-violet-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                disabled={!newPillarName.trim() || addMut.isPending}
                onClick={() => addMut.mutate(newPillarName.trim())}
              >
                Save pillar
              </button>
              <button
                type="button"
                className="rounded border px-3 py-1.5 text-sm"
                onClick={() => {
                  setShowAddPillar(false);
                  setNewPillarName("");
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => setShowAddPillar(true)}>
              Add pillar
            </button>
          )}
        </div>
      ) : null}
      <ul className="space-y-2">
        {pillars.map((p) => (
          <li key={p.id} className="rounded border p-3 text-sm">
            <input
              className="w-full font-medium"
              disabled={locked}
              defaultValue={p.name}
              onBlur={(e) => {
                if (e.target.value !== p.name) patchMut.mutate({ id: p.id, patch: { name: e.target.value } });
              }}
            />
            <input
              className="mt-1 w-full text-xs text-zinc-600"
              placeholder="Description"
              disabled={locked}
              defaultValue={p.description ?? ""}
              onBlur={(e) => patchMut.mutate({ id: p.id, patch: { description: e.target.value || null } })}
            />
            {!locked ? (
              <button type="button" className="mt-2 text-xs text-red-600" onClick={() => patchMut.mutate({ id: p.id, patch: { archived: true } })}>
                Archive pillar
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
