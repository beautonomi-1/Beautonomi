"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Copy, Plus, RefreshCw, Search } from "lucide-react";
import CreateMarketModal from "./CreateMarketModal";
import { formatFetchError } from "../lib/format-fetch-error";
import type { PlatformMarketListItem } from "../lib/platform-types";

interface MarketSidebarProps {
  markets: PlatformMarketListItem[];
  selectedId: string | null;
  loading: boolean;
  includeArchived: boolean;
  onIncludeArchivedChange: (value: boolean) => void;
  onSelect: (id: string) => void;
  onCreateIntent: () => void;
  onMarketCreated: (id: string) => void;
  onRefresh: () => void;
}

export default function MarketSidebar({
  markets,
  selectedId,
  loading,
  includeArchived,
  onIncludeArchivedChange,
  onSelect,
  onCreateIntent,
  onMarketCreated,
  onRefresh,
}: MarketSidebarProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [showClone, setShowClone] = useState(false);
  const [cloneSource, setCloneSource] = useState<PlatformMarketListItem | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloning, setCloning] = useState(false);

  const filtered = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter(
      (z) =>
        z.name.toLowerCase().includes(q) ||
        (z.country_code ?? "").toLowerCase().includes(q) ||
        z.status.toLowerCase().includes(q)
    );
  }, [markets, listQuery]);

  const byCountry = useMemo(() => {
    const m = new Map<string, PlatformMarketListItem[]>();
    for (const z of filtered) {
      const c = (z.country_code ?? "").trim().toUpperCase() || "__NONE__";
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(z);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const openClone = (z: PlatformMarketListItem) => {
    setCloneSource(z);
    setCloneName(`${z.name} — next market`);
    setShowClone(true);
  };

  const handleClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneSource || !cloneName.trim()) return;
    try {
      setCloning(true);
      const res = await fetcher.post<{ data: { id: string } }>("/api/admin/service-zones/clone", {
        source_zone_id: cloneSource.id,
        name: cloneName.trim(),
      });
      const id = res.data?.id;
      if (id) {
        toast.success("Empty draft created for the next market");
        setShowClone(false);
        setCloneSource(null);
        setCloneName("");
        onMarketCreated(id);
      }
    } catch (err) {
      toast.error(formatFetchError(err, "Failed to clone"));
    } finally {
      setCloning(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/90 px-3 py-2.5">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Markets</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            className="h-8 bg-slate-900 text-xs hover:bg-slate-800"
            onClick={() => {
              onCreateIntent();
              setCreateOpen(true);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            New
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <div className="space-y-2 px-3 pb-2 pt-2">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
            <Label htmlFor="show-archived" className="cursor-pointer text-[11px] font-semibold text-slate-800">
              Show archived
            </Label>
            <Switch
              id="show-archived"
              checked={includeArchived}
              onCheckedChange={onIncludeArchivedChange}
              disabled={loading}
            />
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="Search markets…"
              className="h-9 border-slate-300 pl-8 text-xs text-slate-900 placeholder:text-slate-500"
              disabled={loading || markets.length === 0}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-slate-500">Loading…</div>
          ) : markets.length === 0 ? (
            <div className="p-4 text-sm leading-relaxed text-slate-500">
              No markets yet. Create a draft to start city-by-city rollout.
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">No matches for “{listQuery.trim()}”.</div>
          ) : (
            <div className="space-y-4 px-2 pb-4">
              {byCountry.map(([countryCode, list]) => (
                <div key={countryCode}>
                  <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    {countryCode}
                  </div>
                  <ul className="space-y-1.5">
                    {list.map((z) => (
                      <li
                        key={z.id}
                        className={`flex overflow-hidden rounded-xl border shadow-sm transition-colors ${
                          selectedId === z.id
                            ? "border-primary/40 bg-primary/[0.07] ring-1 ring-primary/20"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(z.id)}
                          className={
                            "min-w-0 flex-1 px-3 py-2.5 text-left transition-colors " +
                            (selectedId === z.id ? "font-semibold text-slate-900" : "text-slate-800 hover:bg-slate-50/80")
                          }
                        >
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm">{z.name}</span>
                            {z.status === "active" && (
                              <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-bold uppercase text-white">
                                Live
                              </span>
                            )}
                            {z.status === "archived" && (
                              <span className="shrink-0 rounded-full bg-slate-500 px-2 py-0.5 text-[9px] font-bold uppercase text-white">
                                Archived
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                            {z.status === "draft" ? (
                              <>
                                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                  Draft
                                </span>
                                {(z.inclusion_count ?? 0) === 0 ? (
                                  <span className="text-slate-500">no inclusions yet</span>
                                ) : (
                                  <span className="text-slate-600">
                                    {z.inclusion_count} inclusion{z.inclusion_count === 1 ? "" : "s"}
                                    {z.has_geometry ? ", coverage ready" : ", no geometry"}
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                <span>v{z.version}</span>
                                {z.has_geometry ? (
                                  <span className="text-slate-600">coverage on map</span>
                                ) : (
                                  <span className="text-slate-400">no coverage</span>
                                )}
                                {z.published_at && (
                                  <span className="text-slate-500">
                                    · live {new Date(z.published_at).toLocaleDateString()}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-auto min-h-[44px] min-w-[44px] shrink-0 rounded-none border-l border-slate-200 px-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
                          title={
                            (z.country_code ?? "").trim()
                              ? "Clone empty draft (same country)"
                              : "Set country on this market before cloning"
                          }
                          disabled={!(z.country_code ?? "").trim()}
                          onClick={() => openClone(z)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateMarketModal open={createOpen} onOpenChange={setCreateOpen} onCreated={onMarketCreated} />

      <Dialog open={showClone} onOpenChange={setShowClone}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clone for next market</DialogTitle>
            <DialogDescription>
              Creates a new <strong>empty draft</strong> in {cloneSource?.country_code ?? "the same country"}. Final
              coverage is not copied — add the next city in the builder.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleClone} className="space-y-4">
            <div>
              <Label htmlFor="clone_name">New market name</Label>
              <Input
                id="clone_name"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                placeholder="e.g. Pretoria — phase 1"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowClone(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={cloning}>
                {cloning ? "Creating…" : "Create draft"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
