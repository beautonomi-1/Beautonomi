"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PlatformMarketDetail } from "../lib/platform-types";

interface PublishPanelProps {
  market: PlatformMarketDetail;
  readOnly: boolean;
  loading: boolean;
  publishing: boolean;
  archiving: boolean;
  onPublish: () => Promise<void>;
  onArchive: () => Promise<void>;
}

export default function PublishPanel({
  market,
  readOnly,
  loading,
  publishing,
  archiving,
  onPublish,
  onArchive,
}: PublishPanelProps) {
  const [publishOpen, setPublishOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const canLaunch =
    !readOnly &&
    market.status !== "active" &&
    !!market.geometry_geojson &&
    market.inclusions.length > 0;

  const launchBlockedReason = (() => {
    if (readOnly) return "Archived markets must be restored before launch.";
    if (market.status === "active") return "This market is already live.";
    if (market.inclusions.length === 0) return "Add at least one included area.";
    if (!market.geometry_geojson) return "Coverage is still computing or empty — add included areas.";
    return null;
  })();

  return (
    <>
      <Card className="border-slate-300 bg-gradient-to-b from-white to-slate-50/80 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-900">Launch</CardTitle>
          <p className="text-xs leading-relaxed text-slate-700">
            Live markets power platform location checks. Refresh the page if another editor changed this market (version
            conflicts).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2 text-xs font-medium text-slate-800">
            <li className="flex items-start gap-2.5">
              <span
                className={
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " +
                  (market.inclusions.length > 0 ? "bg-emerald-600 text-white" : "border-2 border-slate-300 text-slate-500")
                }
                aria-hidden
              >
                {market.inclusions.length > 0 ? "✓" : ""}
              </span>
              <span className="pt-0.5">Included areas added</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span
                className={
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " +
                  (market.geometry_geojson ? "bg-emerald-600 text-white" : "border-2 border-slate-300 text-slate-500")
                }
                aria-hidden
              >
                {market.geometry_geojson ? "✓" : ""}
              </span>
              <span className="pt-0.5">Final coverage computed</span>
            </li>
            <li className="flex items-start gap-2.5 text-slate-600">
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-[10px] text-slate-400"
                aria-hidden
              >
                ○
              </span>
              <span className="pt-0.5">Ops checklist (optional): rollout notes & target date above</span>
            </li>
          </ul>

          {launchBlockedReason && market.status !== "active" && (
            <p className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-[11px] font-medium text-slate-800">
              {launchBlockedReason}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="w-full bg-slate-900 text-white hover:bg-slate-800"
              disabled={!canLaunch || publishing || loading}
              onClick={() => setPublishOpen(true)}
            >
              {publishing ? "Launching…" : market.status === "active" ? "Live" : "Launch market"}
            </Button>

            {market.status !== "archived" && (
              <Button
                type="button"
                variant="outline"
                className="w-full border-slate-300 text-xs text-slate-700"
                disabled={archiving || loading}
                onClick={() => setArchiveOpen(true)}
              >
                {archiving ? "Archiving…" : "Archive market"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Launch this market?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-slate-600">
                <p>
                  <strong className="text-slate-900">{market.name}</strong> ({market.country_code ?? "—"}) will go live for
                  platform coverage checks.
                </p>
                <ul className="list-inside list-disc text-xs">
                  <li>{market.inclusions.length} included area(s)</li>
                  <li>{market.exclusions.length} excluded area(s)</li>
                  <li>Version v{market.version} — if launch fails, refresh and try again</li>
                </ul>
                <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-800">
                  Providers whose primary location is inside this market will be automatically enrolled so it&rsquo;s bookable on day one. They can adjust their travel fee at any time.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-slate-900 text-white hover:bg-slate-800"
              onClick={(e) => {
                e.preventDefault();
                void (async () => {
                  try {
                    await onPublish();
                    setPublishOpen(false);
                  } catch {
                    /* parent toasts */
                  }
                })();
              }}
            >
              {publishing ? "Launching…" : "Confirm launch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this market?</AlertDialogTitle>
            <AlertDialogDescription>
              {market.status === "active"
                ? "Live markets stop matching platform coverage until restored or replaced."
                : "Drafts can be restored later from the sidebar (show archived)."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={(e) => {
                e.preventDefault();
                void (async () => {
                  try {
                    await onArchive();
                    setArchiveOpen(false);
                  } catch {
                    /* parent toasts */
                  }
                })();
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
