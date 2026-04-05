"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { PlatformExclusionRow } from "../lib/platform-types";

interface ExcludedAreasListProps {
  items: PlatformExclusionRow[];
  readOnly: boolean;
  removingId: string | null;
  onRemove: (exclusionId: string) => void;
}

function exclusionLabel(ex: PlatformExclusionRow): string {
  if (ex.type === "custom_polygon") return "Drawn area";
  return ex.ref_code ?? ex.ref_name ?? ex.type;
}

export default function ExcludedAreasList({ items, readOnly, removingId, onRemove }: ExcludedAreasListProps) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-slate-900">Excluded areas ({items.length})</Label>
      <p className="text-[11px] leading-relaxed text-slate-600">
        Subtracted from included areas. Add postal exclusions from an included postal row, or draw on the map.
      </p>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs font-medium text-slate-700">
          No excluded areas.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((ex) => (
            <li
              key={ex.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2.5 text-sm shadow-sm"
            >
              <span className="min-w-0 truncate font-medium text-slate-900">{exclusionLabel(ex)}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0 text-rose-700"
                disabled={readOnly || removingId !== null}
                onClick={() => onRemove(ex.id)}
              >
                {removingId === ex.id ? "…" : "Remove"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
