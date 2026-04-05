"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import AreaSearchInput from "./AreaSearchInput";
import IncludedAreasList from "./IncludedAreasList";
import ExcludedAreasList from "./ExcludedAreasList";
import CoverageSummaryCard from "./CoverageSummaryCard";
import PublishPanel from "./PublishPanel";
import MarketBasicsCard from "./MarketBasicsCard";
import MarketRolloutCard from "./MarketRolloutCard";
import { formatFetchError } from "../lib/format-fetch-error";
import type { PlatformMarketDetail } from "../lib/platform-types";

type RolloutSummary = {
  postal_area_count: number;
  cities: string[];
  provinces: string[];
  towns: string[];
};

interface MarketBuilderProps {
  market: PlatformMarketDetail | null;
  loading: boolean;
  onUpdated: () => void;
  onMapFlyTo: (lng: number, lat: number) => void;
}

export default function MarketBuilder({ market, loading, onUpdated, onMapFlyTo }: MarketBuilderProps) {
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [removingInclusion, setRemovingInclusion] = useState<string | null>(null);
  const [removingExclusion, setRemovingExclusion] = useState<string | null>(null);
  const [excludingCode, setExcludingCode] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [rolloutSummary, setRolloutSummary] = useState<RolloutSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const readOnly = Boolean(market && market.status === "archived");

  useEffect(() => {
    if (!market?.id) {
      setRolloutSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setSummaryLoading(true);
      try {
        const res = await fetcher.get<{ data: RolloutSummary }>(
          `/api/admin/service-zones/${market.id}/rollout-summary`
        );
        if (!cancelled) setRolloutSummary(res.data ?? null);
      } catch {
        if (!cancelled) setRolloutSummary(null);
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [market?.id, market?.version, market?.inclusions.length]);

  const addInclude = useCallback(
    async (
      type: "province" | "city" | "town" | "postal_code",
      ref_code: string,
      ref_name?: string,
      opts?: { skipVersion?: boolean }
    ) => {
      if (!market) return;
      if (readOnly) {
        toast.info("Restore this market from archive to edit coverage.");
        return;
      }
      const key = `${type}:${ref_code}`;
      try {
        setAddingKey(key);
        const res = await fetcher.post<{
          data: {
            included: number;
            matched_areas?: number;
            truncated?: boolean;
            message?: string;
            skipped_existing?: number;
          };
        }>(`/api/admin/service-zones/${market.id}/include`, {
          type,
          ref_code,
          ref_name: ref_name ?? ref_code,
          // Skip version check for batch adds — each add bumps the version, so
          // only the first call would pass a single-version optimistic check.
          ...(opts?.skipVersion ? {} : { version: market.version }),
        });
        const payload = res.data;
        if (payload?.included === 0 && payload?.message) {
          toast.info(payload.message);
        } else if (payload?.included) {
          toast.success(`Added ${payload.included.toLocaleString()} postal area${payload.included === 1 ? "" : "s"}`);
          if (payload.truncated) {
            toast.warning(
              "Dataset cap reached — coverage may be incomplete. Try a narrower search or smaller areas."
            );
          }
        } else {
          toast.success(`Added ${ref_code}`);
        }
      } catch (e) {
        toast.error(formatFetchError(e, "Could not add included area"));
      } finally {
        setAddingKey(null);
        // Always refresh so the list and map reflect the latest state, even after errors.
        onUpdated();
      }
    },
    [market, readOnly, onUpdated]
  );

  const removeInclusion = async (inclusionId: string) => {
    if (!market) return;
    if (readOnly) return;
    try {
      setRemovingInclusion(inclusionId);
      await fetcher.delete(`/api/admin/service-zones/${market.id}/inclusions/${inclusionId}`);
      toast.success("Removed from included areas");
      onUpdated();
    } catch (e) {
      toast.error(formatFetchError(e, "Could not remove"));
    } finally {
      setRemovingInclusion(null);
    }
  };

  const addExcludePostal = async (postal_code: string) => {
    if (!market) return;
    if (readOnly) return;
    try {
      setExcludingCode(postal_code);
      await fetcher.post(`/api/admin/service-zones/${market.id}/exclude`, {
        type: "postal_code",
        postal_code,
        version: market.version,
      });
      toast.success(`Excluded ${postal_code}`);
      onUpdated();
    } catch (e) {
      toast.error(formatFetchError(e, "Could not exclude"));
    } finally {
      setExcludingCode(null);
    }
  };

  const removeExclusion = async (exclusionId: string) => {
    if (!market) return;
    if (readOnly) return;
    try {
      setRemovingExclusion(exclusionId);
      await fetcher.delete(`/api/admin/service-zones/${market.id}/exclusions/${exclusionId}`);
      toast.success("Excluded area removed");
      onUpdated();
    } catch (e) {
      toast.error(formatFetchError(e, "Could not remove exclusion"));
    } finally {
      setRemovingExclusion(null);
    }
  };

  const restoreFromArchive = async () => {
    if (!market || market.status !== "archived") return;
    try {
      await fetcher.patch(`/api/admin/service-zones/${market.id}`, {
        status: "draft",
        version: market.version,
      });
      toast.success("Restored to draft — you can edit coverage or launch again.");
      onUpdated();
    } catch (e) {
      toast.error(formatFetchError(e, "Could not restore"));
    }
  };

  const publish = async () => {
    if (!market) throw new Error("No market");
    if (readOnly) {
      toast.info("Restore from archive before launching.");
      throw new Error("Archived");
    }
    try {
      setPublishing(true);
      const res = await fetcher.post<{ data: { enrolled_count?: number } }>(
        `/api/admin/service-zones/${market.id}/publish`,
        { version: market.version }
      );
      const n = res.data?.enrolled_count ?? 0;
      toast.success(
        n > 0
          ? `Market is live — ${n} provider${n === 1 ? "" : "s"} auto-enrolled`
          : "Market is live"
      );
      onUpdated();
    } catch (e) {
      toast.error(formatFetchError(e, "Launch failed — refresh if your version is stale"));
      throw e;
    } finally {
      setPublishing(false);
    }
  };

  const archive = async () => {
    if (!market || market.status === "archived") return;
    try {
      setArchiving(true);
      await fetcher.patch(`/api/admin/service-zones/${market.id}`, {
        status: "archived",
        version: market.version,
      });
      toast.success("Market archived");
      onUpdated();
    } catch (e) {
      toast.error(formatFetchError(e, "Could not archive"));
      throw e;
    } finally {
      setArchiving(false);
    }
  };

  if (!market) {
    return (
      <div className="flex h-full min-h-[min(40vh,280px)] flex-col items-center justify-center gap-3 border-t border-slate-200 bg-gradient-to-b from-slate-50 to-white p-6 text-center sm:min-h-[240px] sm:border-t-0 xl:border-t-0">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          <MapPin className="h-7 w-7 text-slate-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Select a market</p>
          <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-600">
            Choose one from the list or create a new draft to define coverage.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex-none border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Builder</h2>
        <p className="text-[11px] leading-relaxed text-slate-600">
          Included areas minus excluded areas = final coverage on the map.
        </p>
      </div>

      {readOnly && (
        <div className="flex flex-none flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-100 px-4 py-2.5">
          <p className="text-xs font-semibold text-amber-950">Archived — map is read-only. Restore to edit or launch.</p>
          <Button type="button" size="sm" variant="outline" className="h-9 border-amber-400 bg-white text-xs font-medium text-amber-950 hover:bg-amber-50" onClick={() => void restoreFromArchive()}>
            Restore to draft
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
        <MarketBasicsCard market={market} readOnly={readOnly} loading={loading} onUpdated={onUpdated} />

        <div className="rounded-xl border border-sky-200/90 bg-sky-50 px-3.5 py-3.5 text-xs leading-relaxed text-sky-950 shadow-sm">
          <p className="font-semibold text-sky-950">How coverage works</p>
          <p className="mt-1.5 text-sky-950/95">
            <span className="font-semibold">Final coverage</span> is everything you include from the dataset, minus postal
            exclusions and any shapes you draw on the map.
          </p>
        </div>

        <AreaSearchInput
          countryCode={market.country_code ?? ""}
          readOnly={readOnly}
          addingKey={addingKey}
          inclusions={market.inclusions}
          onInclude={addInclude}
          onMapFlyTo={(lng, lat) => onMapFlyTo(lng, lat)}
        />

        <IncludedAreasList
          items={market.inclusions}
          readOnly={readOnly}
          addingKey={addingKey}
          removingId={removingInclusion}
          excludingCode={excludingCode}
          onRemove={removeInclusion}
          onExcludePostal={addExcludePostal}
        />

        <Separator />

        <ExcludedAreasList
          items={market.exclusions}
          readOnly={readOnly}
          removingId={removingExclusion}
          onRemove={removeExclusion}
        />

        <CoverageSummaryCard market={market} rolloutSummary={rolloutSummary} summaryLoading={summaryLoading} />

        <MarketRolloutCard market={market} readOnly={readOnly} loading={loading} onUpdated={onUpdated} />

        <PublishPanel
          market={market}
          readOnly={readOnly}
          loading={loading}
          publishing={publishing}
          archiving={archiving}
          onPublish={publish}
          onArchive={archive}
        />
      </div>
    </div>
  );
}
