"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { formatFetchError } from "../lib/format-fetch-error";
import type { PlatformMarketDetail } from "../lib/platform-types";

const ROLLOUT_MODES = [
  { value: "pilot_single_market", label: "Pilot — single market" },
  { value: "city_by_city", label: "City-by-city expansion" },
  { value: "regional_bundle", label: "Regional bundle (multi-city)" },
  { value: "national", label: "National / full country" },
] as const;

interface MarketRolloutCardProps {
  market: PlatformMarketDetail;
  readOnly: boolean;
  loading: boolean;
  onUpdated: () => void;
}

export default function MarketRolloutCard({ market, readOnly, loading, onUpdated }: MarketRolloutCardProps) {
  const [rolloutMode, setRolloutMode] = useState("city_by_city");
  const [runbookNotes, setRunbookNotes] = useState("");
  const [targetLaunchAt, setTargetLaunchAt] = useState("");
  const [internalCodename, setInternalCodename] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const m = market.ops_metadata;
    const rawMode = typeof m?.rolloutMode === "string" ? m.rolloutMode : "";
    setRolloutMode(ROLLOUT_MODES.some((x) => x.value === rawMode) ? rawMode : "city_by_city");
    setRunbookNotes(typeof m?.runbookNotes === "string" ? m.runbookNotes : "");
    setTargetLaunchAt(typeof m?.targetLaunchAt === "string" ? m.targetLaunchAt : "");
    setInternalCodename(typeof m?.internalCodename === "string" ? m.internalCodename : "");
  }, [market.id, market.updated_at, market.ops_metadata]);

  const save = async () => {
    try {
      setSaving(true);
      await fetcher.patch(`/api/admin/service-zones/${market.id}`, {
        version: market.version,
        ops_metadata: {
          rolloutMode,
          runbookNotes,
          ...(targetLaunchAt.trim() ? { targetLaunchAt: targetLaunchAt.trim() } : { targetLaunchAt: "" }),
          ...(internalCodename.trim() ? { internalCodename: internalCodename.trim() } : { internalCodename: "" }),
        },
      });
      toast.success("Rollout notes saved");
      onUpdated();
    } catch (e) {
      toast.error(formatFetchError(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-900">Rollout &amp; ops</CardTitle>
        <p className="text-xs text-slate-600">Internal planning only — not shown to customers.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {market.ops_metadata?.clonedFromZoneId && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Cloned from <span className="font-medium">{market.ops_metadata.clonedFromName ?? "previous market"}</span>.
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">Expansion strategy</Label>
          <Select value={rolloutMode} onValueChange={setRolloutMode} disabled={readOnly}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Strategy" />
            </SelectTrigger>
            <SelectContent>
              {ROLLOUT_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Internal codename (optional)</Label>
          <Input
            value={internalCodename}
            onChange={(e) => setInternalCodename(e.target.value)}
            placeholder="e.g. ZA-JHB-WAVE-2"
            className="h-9 text-sm"
            disabled={readOnly}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Target go-live date (optional)</Label>
          <Input type="date" value={targetLaunchAt} onChange={(e) => setTargetLaunchAt(e.target.value)} className="h-9 text-sm" disabled={readOnly} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Runbook / launch notes</Label>
          <Textarea
            value={runbookNotes}
            onChange={(e) => setRunbookNotes(e.target.value)}
            placeholder="Checklist links, comms, support readiness…"
            rows={3}
            className="text-sm"
            disabled={readOnly}
          />
        </div>
        <Button type="button" size="sm" className="w-full" disabled={readOnly || saving || loading} onClick={() => void save()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save rollout fields"}
        </Button>
      </CardContent>
    </Card>
  );
}
