"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { formatFetchError } from "../lib/format-fetch-error";
import type { PlatformMarketDetail } from "../lib/platform-types";

interface MarketBasicsCardProps {
  market: PlatformMarketDetail;
  readOnly: boolean;
  loading: boolean;
  onUpdated: () => void;
}

export default function MarketBasicsCard({ market, readOnly, loading, onUpdated }: MarketBasicsCardProps) {
  const [name, setName] = useState(market.name);
  const [country, setCountry] = useState(() => (market.country_code ?? "").trim().toUpperCase());
  const [saving, setSaving] = useState(false);

  const hasCountry = Boolean((market.country_code ?? "").trim());
  /** Country can only change while there are no inclusions (matches API). */
  const canEditCountry = !readOnly && market.inclusions.length === 0;

  useEffect(() => {
    setName(market.name);
    setCountry((market.country_code ?? "").trim().toUpperCase());
  }, [market.id, market.name, market.country_code]);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === market.name) return;
    try {
      setSaving(true);
      await fetcher.patch(`/api/admin/service-zones/${market.id}`, {
        name: trimmed,
        version: market.version,
      });
      toast.success("Market name updated");
      onUpdated();
    } catch (e) {
      toast.error(formatFetchError(e, "Could not save name"));
    } finally {
      setSaving(false);
    }
  };

  const saveCountry = async () => {
    const cc = country.trim().toUpperCase().slice(0, 2);
    if (!/^[A-Z]{2}$/.test(cc)) {
      toast.error("Use a 2-letter ISO country code (e.g. ZA, US).");
      return;
    }
    const prev = (market.country_code ?? "").trim().toUpperCase();
    if (cc === prev) return;
    try {
      setSaving(true);
      await fetcher.patch(`/api/admin/service-zones/${market.id}`, {
        country_code: cc,
        version: market.version,
      });
      toast.success("Country updated — you can search the postal dataset now.");
      onUpdated();
    } catch (e) {
      toast.error(formatFetchError(e, "Could not save country"));
    } finally {
      setSaving(false);
    }
  };

  const statusLabel =
    market.status === "active" ? "Live" : market.status === "archived" ? "Archived" : "Draft";

  return (
    <Card className="border-slate-300 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold text-slate-900">Basics</CardTitle>
          <Badge
            variant={market.status === "active" ? "default" : "secondary"}
            className={
              market.status === "active"
                ? "bg-emerald-600 hover:bg-emerald-600"
                : market.status === "archived"
                  ? "bg-slate-500 hover:bg-slate-500"
                  : ""
            }
          >
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasCountry && !readOnly && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-950">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <AlertTitle className="text-sm font-semibold text-amber-950">Country is missing</AlertTitle>
            <AlertDescription className="text-xs leading-relaxed text-amber-900/95">
              Dataset search and rollout need an ISO-2 country (e.g. ZA for South Africa). Set it below, then use{" "}
              <span className="font-medium">Add included areas</span>.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="market-name" className="text-xs font-medium text-slate-800">
            Market name
          </Label>
          <div className="flex gap-2">
            <Input
              id="market-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly || loading}
              className="text-sm"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={readOnly || loading || saving || name.trim() === market.name || !name.trim()}
              onClick={() => void saveName()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="market-country" className="text-xs font-medium text-slate-800">
            Country (ISO-2)
          </Label>
          {canEditCountry ? (
            <div className="flex gap-2">
              <Input
                id="market-country"
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
                placeholder="ZA"
                maxLength={2}
                disabled={readOnly || loading}
                className="font-mono text-sm uppercase"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={
                  readOnly ||
                  loading ||
                  saving ||
                  country.trim().length !== 2 ||
                  country.trim().toUpperCase() === (market.country_code ?? "").trim().toUpperCase()
                }
                onClick={() => void saveCountry()}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          ) : (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm font-semibold text-slate-900">
              {(market.country_code ?? "—").toUpperCase() || "—"}
            </p>
          )}
          {!canEditCountry && market.inclusions.length > 0 && (
            <p className="text-[11px] leading-relaxed text-slate-600">
              Country is locked while this market has included areas. Remove all inclusions first to change it.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-xs sm:grid-cols-2">
          <div>
            <span className="font-medium text-slate-600">Last updated</span>
            <p className="mt-0.5 font-medium text-slate-900">
              {market.updated_at ? new Date(market.updated_at).toLocaleString() : "—"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
