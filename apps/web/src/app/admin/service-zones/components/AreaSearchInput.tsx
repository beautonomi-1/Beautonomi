"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { AlertTriangle, Check, CheckSquare, Loader2, MapPin, Search, Square } from "lucide-react";
import { formatFetchError } from "../lib/format-fetch-error";
import type { PlatformInclusionRow } from "../lib/platform-types";

type AreaSearchHit = { name: string; postal_count: number; count_is_floor: boolean };

type AreaSearchResult = {
  provinces: AreaSearchHit[];
  cities: AreaSearchHit[];
  towns: AreaSearchHit[];
  postal_codes: string[];
};

type MapboxFeature = {
  place_name?: string;
  text?: string;
  center?: [number, number];
  type?: string;
};

type IncludeType = "province" | "city" | "town" | "postal_code";

type PendingItem = { type: IncludeType; ref_code: string; ref_name?: string };

function formatCount(hit: AreaSearchHit): string {
  const n = hit.postal_count.toLocaleString();
  return hit.count_is_floor ? `${n}+` : n;
}

interface AreaSearchInputProps {
  countryCode: string;
  readOnly: boolean;
  addingKey: string | null;
  /** Currently included areas — used to show "already included" state */
  inclusions?: PlatformInclusionRow[];
  onInclude: (
    type: IncludeType,
    ref_code: string,
    ref_name?: string,
    opts?: { skipVersion?: boolean }
  ) => Promise<void> | void;
  onMapFlyTo?: (lng: number, lat: number, label: string) => void;
}

export default function AreaSearchInput({
  countryCode,
  readOnly,
  addingKey,
  inclusions = [],
  onInclude,
  onMapFlyTo,
}: AreaSearchInputProps) {
  const iso2 = countryCode.trim();
  const countryOk = iso2.length === 2 && /^[A-Za-z]{2}$/.test(iso2);

  const [searchQ, setSearchQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [datasetResults, setDatasetResults] = useState<AreaSearchResult | null>(null);
  const [mapboxResults, setMapboxResults] = useState<MapboxFeature[]>([]);
  const [searching, setSearching] = useState(false);
  const [mapboxLoading, setMapboxLoading] = useState(false);
  const [mapboxError, setMapboxError] = useState(false);

  // Multi-select: key format is "type:ref_code"
  const [pending, setPending] = useState<Map<string, PendingItem>>(new Map());
  const [addingBatch, setAddingBatch] = useState(false);

  // Build a Set of already-included ref_codes for O(1) lookup
  const includedNames = new Set(inclusions.map((i) => (i.ref_name ?? "").toLowerCase()));

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchQ.trim()), 320);
    return () => window.clearTimeout(t);
  }, [searchQ]);

  // Clear pending selections when search results change
  useEffect(() => {
    setPending(new Map());
  }, [debouncedQ]);

  const runDatasetSearch = useCallback(async () => {
    if (!countryOk || debouncedQ.length < 2) {
      setDatasetResults(null);
      return;
    }
    try {
      setSearching(true);
      const res = await fetcher.get<{ data: AreaSearchResult }>(
        `/api/admin/service-zones/areas/search?country=${encodeURIComponent(iso2.toUpperCase())}&q=${encodeURIComponent(debouncedQ)}`
      );
      setDatasetResults(res.data ?? null);
    } catch (e) {
      toast.error(formatFetchError(e, "Search failed"));
      setDatasetResults(null);
    } finally {
      setSearching(false);
    }
  }, [countryCode, debouncedQ]);

  useEffect(() => {
    void runDatasetSearch();
  }, [runDatasetSearch]);

  useEffect(() => {
    if (debouncedQ.length < 3) {
      setMapboxResults([]);
      setMapboxError(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setMapboxLoading(true);
        setMapboxError(false);
        const res = await fetch("/api/mapbox/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: debouncedQ,
            limit: 6,
            ...(countryOk ? { country: iso2.toLowerCase() } : {}),
            types: ["place", "locality", "district", "postcode", "region"],
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { data?: MapboxFeature[]; error?: unknown };
        if (cancelled) return;
        if (!res.ok) {
          setMapboxResults([]);
          setMapboxError(true);
          return;
        }
        setMapboxResults(Array.isArray(json.data) ? json.data : []);
      } catch {
        if (!cancelled) {
          setMapboxResults([]);
          setMapboxError(true);
        }
      } finally {
        if (!cancelled) setMapboxLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedQ, countryOk, iso2]);

  const togglePending = (type: IncludeType, ref_code: string, ref_name?: string) => {
    const k = `${type}:${ref_code}`;
    setPending((prev) => {
      const next = new Map(prev);
      if (next.has(k)) {
        next.delete(k);
      } else {
        next.set(k, { type, ref_code, ref_name });
      }
      return next;
    });
  };

  const addAllPending = async () => {
    if (pending.size === 0 || readOnly) return;
    setAddingBatch(true);
    const items = Array.from(pending.values());
    // Clear pending immediately so chips return to unselected state
    setPending(new Map());
    try {
      // Fire all includes concurrently. skipVersion prevents 409 conflicts when
      // multiple adds run in parallel and each one bumps the zone version.
      await Promise.all(
        items.map((item) =>
          Promise.resolve(onInclude(item.type, item.ref_code, item.ref_name, { skipVersion: true }))
        )
      );
    } catch {
      // Individual errors are already toasted inside onInclude
    } finally {
      setAddingBatch(false);
    }
  };

  const addSingle = (type: IncludeType, ref_code: string, ref_name?: string) => {
    if (readOnly) return;
    onInclude(type, ref_code, ref_name);
  };

  const emptyDataset =
    datasetResults &&
    datasetResults.provinces.length === 0 &&
    datasetResults.cities.length === 0 &&
    datasetResults.towns.length === 0 &&
    datasetResults.postal_codes.length === 0;

  const isAdding = addingKey !== null || addingBatch;

  /** Render a single area result chip */
  const renderHitChip = (
    type: IncludeType,
    ref_code: string,
    ref_name: string,
    postal_count?: number,
    count_is_floor?: boolean
  ) => {
    const k = `${type}:${ref_code}`;
    const alreadyIncluded = includedNames.has(ref_name.toLowerCase());
    const selected = pending.has(k);
    const adding = addingKey === k;

    if (alreadyIncluded) {
      return (
        <span
          key={k}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800"
        >
          <Check className="h-3 w-3 shrink-0 text-emerald-600" />
          <span className="font-medium">{ref_name}</span>
          {postal_count !== undefined && (
            <span className="text-[10px] text-emerald-600">
              {count_is_floor ? `${postal_count.toLocaleString()}+` : postal_count.toLocaleString()} areas
            </span>
          )}
        </span>
      );
    }

    return (
      <button
        key={k}
        type="button"
        className={[
          "inline-flex h-auto max-w-full items-start gap-1.5 whitespace-normal rounded-lg border px-2.5 py-1.5 text-left text-xs shadow-sm transition",
          selected
            ? "border-sky-400 bg-sky-50 ring-1 ring-sky-300 text-slate-900"
            : "border-sky-200/80 bg-white text-slate-900 hover:bg-sky-50",
        ].join(" ")}
        disabled={isAdding}
        onClick={() => togglePending(type, ref_code, ref_name)}
        title={selected ? `Deselect ${ref_name}` : `Select ${ref_name}`}
      >
        {adding ? (
          <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-slate-500" />
        ) : selected ? (
          <CheckSquare className="mt-0.5 h-3 w-3 shrink-0 text-sky-600" />
        ) : (
          <Square className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
        )}
        <span>
          <span className="font-medium">{ref_name}</span>
          {postal_count !== undefined && (
            <span className="block text-[10px] font-medium text-slate-600">
              +{count_is_floor ? `${postal_count.toLocaleString()}+` : postal_count.toLocaleString()} postal areas
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {!readOnly && !countryOk && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <AlertTitle className="text-sm font-semibold">Set country in Basics first</AlertTitle>
          <AlertDescription className="text-xs leading-relaxed text-amber-900/95">
            Postal dataset search needs a 2-letter country code on this market. Map suggestions may still appear without
            it, but you cannot add coverage from the dataset until country is saved.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-3.5">
        <Label className="text-xs font-semibold text-slate-900">Add included areas</Label>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
          Search the dataset, select one or more results, then add them together. Map suggestions help you pan the map.
        </p>
        <div className="relative mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="City, town, suburb, postal code…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void runDatasetSearch()}
              className="h-10 border-slate-300 pl-9 text-sm text-slate-900 placeholder:text-slate-500"
              disabled={readOnly}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-10 shrink-0 border border-slate-300 bg-slate-100 font-medium text-slate-900 hover:bg-slate-200 sm:h-auto sm:px-4"
            onClick={() => void runDatasetSearch()}
            disabled={readOnly || !countryOk || searching || searchQ.trim().length < 2}
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </div>
      </div>

      {datasetResults && (
        <div className="space-y-3 rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm shadow-inner">
          {emptyDataset && (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-xs font-medium text-slate-700">
              No dataset matches. Try another spelling or a postal code.
            </p>
          )}

          {datasetResults.provinces.length > 0 && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-700">
                Provinces / regions
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {datasetResults.provinces.map((hit) =>
                  renderHitChip("province", hit.name, hit.name, hit.postal_count, hit.count_is_floor)
                )}
              </div>
            </div>
          )}

          {datasetResults.cities.length > 0 && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-700">Cities</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {datasetResults.cities.map((hit) =>
                  renderHitChip("city", hit.name, hit.name, hit.postal_count, hit.count_is_floor)
                )}
              </div>
            </div>
          )}

          {datasetResults.towns.length > 0 && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-700">
                Towns & suburbs
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {datasetResults.towns.map((hit) =>
                  renderHitChip("town", hit.name, hit.name, hit.postal_count, hit.count_is_floor)
                )}
              </div>
            </div>
          )}

          {datasetResults.postal_codes.length > 0 && (
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-700">
                Postal codes
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {datasetResults.postal_codes.map((code) => {
                  const k = `postal_code:${code}`;
                  const alreadyIncluded = inclusions.some((i) => i.ref_code === code);
                  const selected = pending.has(k);
                  const adding = addingKey === k;

                  if (alreadyIncluded) {
                    return (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
                      >
                        <Check className="h-3 w-3" />
                        {code}
                      </span>
                    );
                  }
                  return (
                    <button
                      key={k}
                      type="button"
                      className={[
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition",
                        selected
                          ? "border-sky-400 bg-sky-50 text-sky-800 ring-1 ring-sky-300"
                          : "border-slate-400 bg-white text-slate-900 hover:bg-slate-50",
                      ].join(" ")}
                      disabled={isAdding}
                      onClick={() => togglePending("postal_code", code)}
                    >
                      {adding ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : selected ? (
                        <CheckSquare className="h-3 w-3 text-sky-600" />
                      ) : null}
                      {code}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sticky add-selected / add-all bar */}
          {!emptyDataset && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
              {pending.size > 0 ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 bg-slate-900 text-xs hover:bg-slate-800"
                    disabled={isAdding}
                    onClick={() => void addAllPending()}
                  >
                    {isAdding ? (
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : (
                      <CheckSquare className="mr-1.5 h-3 w-3" />
                    )}
                    Add {pending.size} selected
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-slate-600"
                    disabled={isAdding}
                    onClick={() => setPending(new Map())}
                  >
                    Clear selection
                  </Button>
                </>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Select one or more areas above, then click &ldquo;Add selected&rdquo;.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {(mapboxLoading || mapboxResults.length > 0 || mapboxError) && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2.5 shadow-sm">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-950">
            <MapPin className="h-3.5 w-3.5 text-violet-700" />
            Map suggestions
            {mapboxLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />}
          </div>
          {mapboxError && (
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-950">
              Map search unavailable (check Mapbox keys or network). Dataset search above still works.
            </p>
          )}
          {!mapboxLoading && mapboxResults.length === 0 && !mapboxError && debouncedQ.length >= 3 && (
            <p className="mt-2 text-[11px] font-medium text-violet-900/90">
              No map suggestions for this query.
            </p>
          )}
          <ul className="mt-2 space-y-1">
            {mapboxResults.map((f, i) => {
              const label = f.place_name || f.text || "Place";
              const c = f.center;
              return (
                <li key={`${label}-${i}`}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-violet-200/80 bg-white px-2.5 py-2 text-left text-xs text-slate-900 shadow-sm transition hover:border-violet-300 hover:bg-violet-50/90"
                    disabled={readOnly}
                    onClick={() => {
                      if (c && c.length >= 2) onMapFlyTo?.(c[0], c[1], label);
                      const q = f.text || label.split(",")[0]?.trim() || label;
                      setSearchQ(q);
                    }}
                  >
                    <span className="font-semibold leading-snug">{label}</span>
                    <span className="mt-0.5 block text-[10px] font-medium text-slate-600">
                      Pan map · refine dataset search
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
