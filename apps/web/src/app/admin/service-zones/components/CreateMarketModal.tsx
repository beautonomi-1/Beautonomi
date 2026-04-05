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
import { toast } from "sonner";
import { formatFetchError } from "../lib/format-fetch-error";

type CreatedMarket = { id: string; version: number; country_code: string };

interface CreateMarketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}

export default function CreateMarketModal({ open, onOpenChange, onCreated }: CreateMarketModalProps) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("ZA");
  const [seedCity, setSeedCity] = useState("");
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setName("");
    setCountry("ZA");
    setSeedCity("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !country.trim()) return;
    try {
      setCreating(true);
      const res = await fetcher.post<{ data: CreatedMarket }>("/api/admin/service-zones", {
        name: name.trim(),
        country_code: country.trim().toUpperCase().slice(0, 2),
      });
      const row = res.data;
      if (!row?.id) {
        toast.error("Create failed — no id returned");
        return;
      }

      if (seedCity.trim()) {
        try {
          await fetcher.post(`/api/admin/service-zones/${row.id}/include`, {
            type: "city",
            ref_code: seedCity.trim(),
            ref_name: seedCity.trim(),
            version: row.version,
          });
          toast.success("Draft market created — first city added");
        } catch (incErr) {
          toast.warning(formatFetchError(incErr, "Market created but seed city could not be added"));
        }
      } else {
        toast.success("Draft market created");
      }

      onOpenChange(false);
      reset();
      onCreated(row.id);
    } catch (err) {
      toast.error(formatFetchError(err, "Failed to create market"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create market</DialogTitle>
          <DialogDescription>
            One launch unit per row (e.g. a city or tight metro). You will add included areas next — coverage is always{" "}
            <span className="font-medium text-slate-800">included areas minus excluded areas</span>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="m-name">Market name</Label>
            <Input
              id="m-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Johannesburg — Phase 1"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-country">Country (ISO-2)</Label>
            <Input
              id="m-country"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              placeholder="ZA"
              maxLength={2}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-seed">Seed city (optional)</Label>
            <Input
              id="m-seed"
              value={seedCity}
              onChange={(e) => setSeedCity(e.target.value)}
              placeholder="e.g. Johannesburg — adds city coverage if it matches the dataset"
            />
            <p className="text-[11px] text-slate-500">
              Must match a city name in your postal dataset for this country. You can add areas manually after create.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
