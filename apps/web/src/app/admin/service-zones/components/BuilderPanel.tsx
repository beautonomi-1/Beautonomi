"use client";

import React, { useState, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import type { ZoneDetail } from "../page";

function formatFetchError(e: unknown, fallback: string): string {
  if (!(e instanceof FetchError)) return e instanceof Error ? e.message : fallback;
  return e.details ? `${e.message}: ${JSON.stringify(e.details)}` : e.message;
}

interface BuilderPanelProps {
  zone: ZoneDetail | null;
  loading: boolean;
  onUpdated: () => void;
  onZoneCreated: (id: string) => void;
}

type AreaSearchResult = {
  provinces: string[];
  cities: string[];
  towns: string[];
  postal_codes: string[];
};

export default function BuilderPanel({ zone, loading, onUpdated, onZoneCreated }: BuilderPanelProps) {
  const [activeTab, setActiveTab] = useState("coverage");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<AreaSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [excluding, setExcluding] = useState<string | null>(null);
  const [removingExclusion, setRemovingExclusion] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const country = zone?.country_code ?? "";

  const runSearch = useCallback(async () => {
    if (!country || searchQ.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    try {
      setSearching(true);
      const res = await fetcher.get<{ data: AreaSearchResult }>(
        `/api/admin/service-zones/areas/search?country=${encodeURIComponent(country)}&q=${encodeURIComponent(searchQ.trim())}`
      );
      setSearchResults(res.data ?? null);
    } catch (e) {
      toast.error(formatFetchError(e, "Search failed"));
      setSearchResults(null);
    } finally {
      setSearching(false);
    }
  }, [country, searchQ]);

  const addInclude = async (type: "province" | "city" | "town" | "postal_code", ref_code: string, ref_name?: string) => {
    if (!zone) return;
    const key = `${type}:${ref_code}`;
    try {
      setAdding(key);
      await fetcher.post(`/api/admin/service-zones/${zone.id}/include`, {
        type,
        ref_code,
        ref_name: ref_name ?? ref_code,
        version: zone.version,
      });
      toast.success(`Added ${ref_code}`);
      onUpdated();
    } catch (e) {
      toast.error(formatFetchError(e, "Failed to add area"));
    } finally {
      setAdding(null);
    }
  };

  const addExclude = async (postal_code: string) => {
    if (!zone) return;
    try {
      setExcluding(postal_code);
      await fetcher.post(`/api/admin/service-zones/${zone.id}/exclude`, {
        type: "postal_code",
        postal_code,
        version: zone.version,
      });
      toast.success(`Excluded ${postal_code}`);
      onUpdated();
    } catch (e) {
      toast.error(formatFetchError(e, "Failed to exclude"));
    } finally {
      setExcluding(null);
    }
  };

  const removeExclusion = async (exclusionId: string) => {
    if (!zone) return;
    try {
      setRemovingExclusion(exclusionId);
      await fetcher.delete(`/api/admin/service-zones/${zone.id}/exclusions/${exclusionId}`);
      toast.success("Exclusion removed");
      onUpdated();
    } catch (e) {
      toast.error(formatFetchError(e, "Failed to remove exclusion"));
    } finally {
      setRemovingExclusion(null);
    }
  };

  const publish = async () => {
    if (!zone) return;
    if (zone.status === "active") {
      toast.info("Zone is already active");
      return;
    }
    if (!confirm("Publish this zone? It will become active and available for providers.")) return;
    try {
      setPublishing(true);
      await fetcher.post(`/api/admin/service-zones/${zone.id}/publish`, { version: zone.version });
      toast.success("Zone published");
      onUpdated();
    } catch (e) {
      toast.error(formatFetchError(e, "Failed to publish"));
    } finally {
      setPublishing(false);
    }
  };

  if (!zone) {
    return (
      <div className="p-4 flex flex-col items-center justify-center text-center text-gray-500 h-full min-h-[200px]">
        <MapPin className="w-10 h-10 mb-2 opacity-50" />
        <p className="text-sm">Select a zone from the list or create a new draft.</p>
      </div>
    );
  }

  const inclusionPostalCodes = new Set(
    zone.inclusions.filter((i) => i.type === "postal_code").map((i) => i.ref_code)
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b">
        <h2 className="font-medium truncate">{zone.name}</h2>
        <p className="text-xs text-gray-500">
          {zone.country_code} · {zone.status} · v{zone.version}
        </p>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full grid grid-cols-3 mx-3 mt-2">
          <TabsTrigger value="coverage" className="text-xs">Coverage</TabsTrigger>
          <TabsTrigger value="exclusions" className="text-xs">Exclusions</TabsTrigger>
          <TabsTrigger value="preview" className="text-xs">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="coverage" className="flex-1 overflow-y-auto mt-2 px-3 pb-4 data-[state=inactive]:hidden">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Country</Label>
              <p className="text-sm font-medium">{zone.country_code}</p>
            </div>
            <div>
              <Label className="text-xs">Search areas</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="Province, city, town or postal code..."
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  className="text-sm"
                />
                <Button size="sm" variant="outline" onClick={runSearch} disabled={searching || searchQ.trim().length < 2}>
                  {searching ? "..." : "Search"}
                </Button>
              </div>
            </div>
            {searchResults && (
              <div className="space-y-2 text-sm">
                {searchResults.provinces.length > 0 && (
                  <div>
                    <span className="text-gray-500 font-medium">Provinces</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {searchResults.provinces.slice(0, 15).map((name) => {
                        const key = `province:${name}`;
                        return (
                          <Button
                            key={key}
                            size="sm"
                            variant="secondary"
                            className="text-xs"
                            disabled={adding !== null}
                            onClick={() => addInclude("province", name)}
                          >
                            {adding === key ? "..." : name}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {searchResults.cities.length > 0 && (
                  <div>
                    <span className="text-gray-500 font-medium">Cities</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {searchResults.cities.slice(0, 15).map((name) => {
                        const key = `city:${name}`;
                        return (
                          <Button
                            key={key}
                            size="sm"
                            variant="secondary"
                            className="text-xs"
                            disabled={adding !== null}
                            onClick={() => addInclude("city", name)}
                          >
                            {adding === key ? "..." : name}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {searchResults.towns.length > 0 && (
                  <div>
                    <span className="text-gray-500 font-medium">Towns</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {searchResults.towns.slice(0, 15).map((name) => {
                        const key = `town:${name}`;
                        return (
                          <Button
                            key={key}
                            size="sm"
                            variant="secondary"
                            className="text-xs"
                            disabled={adding !== null}
                            onClick={() => addInclude("town", name)}
                          >
                            {adding === key ? "..." : name}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {searchResults.postal_codes.length > 0 && (
                  <div>
                    <span className="text-gray-500 font-medium">Postal codes</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {searchResults.postal_codes.slice(0, 20).map((code) => {
                        const key = `postal_code:${code}`;
                        return (
                          <Button
                            key={key}
                            size="sm"
                            variant="secondary"
                            className="text-xs"
                            disabled={adding !== null}
                            onClick={() => addInclude("postal_code", code)}
                          >
                            {adding === key ? "..." : code}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div>
              <Label className="text-xs">Included ({zone.inclusions.length})</Label>
              <ul className="mt-1 space-y-1 max-h-40 overflow-y-auto text-xs">
                {zone.inclusions.length === 0 ? (
                  <li className="text-gray-500">No areas added yet. Search and add above.</li>
                ) : (
                  Array.from(
                    new Map(zone.inclusions.map((i) => [`${i.type}:${i.ref_code}`, i])).values()
                  ).map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 py-0.5">
                      <span>
                        <span className="text-gray-500">{i.type}:</span> {i.ref_code}
                      </span>
                      {i.type === "postal_code" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-red-600 hover:text-red-700"
                          disabled={excluding !== null}
                          onClick={() => addExclude(i.ref_code)}
                        >
                          {excluding === i.ref_code ? "..." : "Exclude"}
                        </Button>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="exclusions" className="flex-1 overflow-y-auto mt-2 px-3 pb-4 data-[state=inactive]:hidden">
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Excluded areas (holes in the zone).</p>
            {zone.exclusions.length === 0 ? (
              <p className="text-sm text-gray-500">No exclusions.</p>
            ) : (
              <ul className="space-y-1">
                {zone.exclusions.map((ex) => (
                  <li key={ex.id} className="flex items-center justify-between text-sm py-1 border-b">
                    <span>{ex.ref_code ?? ex.ref_name ?? ex.type}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      disabled={removingExclusion !== null}
                      onClick={() => removeExclusion(ex.id)}
                    >
                      {removingExclusion === ex.id ? "..." : "Remove"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
        <TabsContent value="preview" className="flex-1 overflow-y-auto mt-2 px-3 pb-4 data-[state=inactive]:hidden">
          <div className="space-y-3">
            {(zone as { disconnected_fragments?: boolean }).disconnected_fragments && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                Zone has multiple disconnected areas (MultiPolygon). This is allowed; ensure it matches intent.
              </div>
            )}
            <div>
              <Label className="text-xs">Version</Label>
              <p className="text-sm">{zone.version}</p>
            </div>
            <div>
              <Label className="text-xs">Last updated</Label>
              <p className="text-sm">{zone.updated_at ? new Date(zone.updated_at).toLocaleString() : "—"}</p>
            </div>
            {zone.bbox && (
              <div>
                <Label className="text-xs">Bounding box</Label>
                <p className="text-xs font-mono text-gray-600">
                  {Array.isArray(zone.bbox)
                    ? `[${zone.bbox.slice(0, 4).join(", ")}]`
                    : "minLng" in zone.bbox
                    ? `${(zone.bbox as { minLng: number }).minLng.toFixed(4)}, …`
                    : "—"}
                </p>
              </div>
            )}
            <div className="pt-2">
              <Button
                className="w-full bg-[#FF0077] hover:bg-[#D60565]"
                disabled={zone.status === "active" || publishing || loading}
                onClick={publish}
              >
                {publishing ? "Publishing..." : zone.status === "active" ? "Active" : "Publish zone"}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
