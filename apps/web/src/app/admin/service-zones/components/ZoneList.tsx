"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetcher } from "@/lib/http/fetcher";
import { FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import type { ZoneListItem } from "../page";

function formatFetchError(e: unknown, fallback: string): string {
  if (!(e instanceof FetchError)) return e instanceof Error ? e.message : fallback;
  return e.details ? `${e.message}: ${JSON.stringify(e.details)}` : e.message;
}

interface ZoneListProps {
  zones: ZoneListItem[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onCreateClick: () => void;
  onZoneCreated: (id: string) => void;
  onRefresh: () => void;
}

export default function ZoneList(
  props: ZoneListProps
) {
  const { zones, selectedId, loading, onSelect, onZoneCreated, onRefresh } = props;
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCountry, setCreateCountry] = useState("ZA");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createCountry.trim()) return;
    try {
      setCreating(true);
      const res = await fetcher.post<{ data: { id: string } }>("/api/admin/service-zones", {
        name: createName.trim(),
        country_code: createCountry.trim().toUpperCase().slice(0, 2),
      });
      const id = res.data?.id;
      if (id) {
        toast.success("Draft zone created");
        setShowCreate(false);
        setCreateName("");
        setCreateCountry("ZA");
        onZoneCreated(id);
      }
    } catch (e) {
      toast.error(formatFetchError(e, "Failed to create zone"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="p-3 border-b flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">Zones</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={onRefresh} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button size="sm" className="bg-primary hover:bg-primary-hover" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Create
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-gray-500">Loading...</div>
        ) : zones.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">
            No zones. Create a draft to define coverage by country and areas.
          </div>
        ) : (
          <ul className="p-2 space-y-1">
            {zones.map((z) => (
              <li key={z.id}>
                <button
                  type="button"
                  onClick={() => onSelect(z.id)}
                  className={"w-full text-left px-3 py-2 rounded-lg text-sm transition-colors " +
                    (selectedId === z.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-gray-100")}
                >
                  <div className="font-medium truncate">{z.name}</div>
                  <div className="text-xs text-gray-500">
                    {z.country_code} · {z.status} · v{z.version}
                    {z.has_geometry ? " · geom" : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create service zone</DialogTitle>
            <DialogDescription>
              Create a draft zone. Then add coverage (country, province, city, postal codes) in the builder.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Cape Town Metro"
                required
              />
            </div>
            <div>
              <Label htmlFor="country">Country (ISO 2)</Label>
              <Input
                id="country"
                value={createCountry}
                onChange={(e) => setCreateCountry(e.target.value.toUpperCase())}
                placeholder="ZA"
                maxLength={2}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create draft"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
