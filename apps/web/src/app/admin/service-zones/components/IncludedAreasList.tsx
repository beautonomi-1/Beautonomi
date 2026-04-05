"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2 } from "lucide-react";
import type { PlatformInclusionRow } from "../lib/platform-types";

interface IncludedAreasListProps {
  items: PlatformInclusionRow[];
  readOnly: boolean;
  addingKey: string | null;
  removingId: string | null;
  excludingCode: string | null;
  onRemove: (inclusionId: string) => void;
  onExcludePostal: (postalCode: string) => void;
}

export default function IncludedAreasList({
  items,
  readOnly,
  addingKey,
  removingId,
  excludingCode,
  onRemove,
  onExcludePostal,
}: IncludedAreasListProps) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const unique = Array.from(new Map(items.map((i) => [`${i.type}:${i.ref_code}`, i])).values());
    if (!q) return unique;
    return unique.filter(
      (i) =>
        i.ref_code.toLowerCase().includes(q) ||
        (i.ref_name && i.ref_name.toLowerCase().includes(q)) ||
        i.type.toLowerCase().includes(q)
    );
  }, [items, filter]);

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <Label className="text-xs font-semibold text-slate-900">Included areas ({items.length})</Label>
      </div>
      <Input
        placeholder="Filter included areas…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="h-8 text-xs"
      />
      <ul className="max-h-52 space-y-1 overflow-y-auto text-xs">
        {filtered.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs font-medium text-slate-700">
            {items.length === 0 ? "No included areas yet. Search above to add a city or postal code." : "Nothing matches this filter."}
          </li>
        ) : (
          filtered.map((i) => (
            <li
              key={i.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white py-2 pl-2.5 pr-1 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <span className="font-mono text-[11px] font-semibold text-slate-900">{i.ref_code}</span>
                {i.ref_name && i.ref_name !== i.ref_code && (
                  <p className="truncate text-[10px] text-slate-600">{i.ref_name}</p>
                )}
                <p className="text-[10px] capitalize text-slate-500">{i.type.replace(/_/g, " ")}</p>
              </div>
              <div className="flex shrink-0 flex-col gap-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-1.5 text-[10px] text-slate-600"
                  disabled={readOnly || removingId !== null || addingKey !== null}
                  onClick={() => onRemove(i.id)}
                >
                  {removingId === i.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="mr-0.5 inline h-3 w-3" />
                      Remove
                    </>
                  )}
                </Button>
                {i.type === "postal_code" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-1.5 text-[10px] text-rose-700"
                    disabled={readOnly || excludingCode !== null || addingKey !== null}
                    onClick={() => onExcludePostal(i.ref_code)}
                    title="Move this postal code to excluded areas"
                  >
                    {excludingCode === i.ref_code ? "…" : "Exclude"}
                  </Button>
                )}
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
