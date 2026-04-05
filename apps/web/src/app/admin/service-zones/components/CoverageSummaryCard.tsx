"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PlatformMarketDetail } from "../lib/platform-types";

type RolloutSummary = {
  postal_area_count: number;
  cities: string[];
  provinces: string[];
  towns: string[];
};

type CoverageStatus = "empty" | "valid" | "error";

function coverageStatus(market: PlatformMarketDetail): CoverageStatus {
  if (!market.geometry_geojson) {
    return market.inclusions.length > 0 ? "error" : "empty";
  }
  return "valid";
}

interface CoverageSummaryCardProps {
  market: PlatformMarketDetail;
  rolloutSummary: RolloutSummary | null;
  summaryLoading: boolean;
}

export default function CoverageSummaryCard({ market, rolloutSummary, summaryLoading }: CoverageSummaryCardProps) {
  const status = coverageStatus(market);

  return (
    <Card className="border-slate-300 shadow-sm">
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="text-sm font-semibold text-slate-900">Coverage summary</CardTitle>
        <p className="text-xs leading-relaxed text-slate-700">
          <span className="font-medium text-slate-800">Final coverage</span> = included areas − excluded areas. The map
          shows gross included shape, exclusions, and the resulting outline.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="font-normal">
            Included: {market.inclusions.length}
          </Badge>
          <Badge variant="secondary" className="font-normal">
            Excluded: {market.exclusions.length}
          </Badge>
          <Badge variant="secondary" className="font-normal">
            Version v{market.version}
          </Badge>
          {status === "valid" && (
            <Badge className="bg-emerald-600 font-normal hover:bg-emerald-600">Coverage ready</Badge>
          )}
          {status === "empty" && <Badge variant="outline">No coverage yet</Badge>}
          {status === "error" && (
            <Badge variant="destructive" className="font-normal">
              Needs attention
            </Badge>
          )}
        </div>

        {market.disconnected_fragments && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
            Multiple separate coverage islands detected. Confirm this matches your launch plan.
          </p>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-700">Rollup</p>
          {summaryLoading ? (
            <p className="mt-1 text-xs text-slate-500">Updating…</p>
          ) : rolloutSummary ? (
            <dl className="mt-2 space-y-1 text-xs text-slate-800">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Postal areas</dt>
                <dd className="font-medium tabular-nums">{rolloutSummary.postal_area_count.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Distinct cities</dt>
                <dd className="font-medium tabular-nums">{rolloutSummary.cities.length.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Provinces / states</dt>
                <dd className="font-medium tabular-nums">{rolloutSummary.provinces.length.toLocaleString()}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Add included areas to see rollup.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
