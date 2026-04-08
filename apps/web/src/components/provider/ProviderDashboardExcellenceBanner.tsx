"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import {
  PROVIDER_EXCELLENCE_DASHBOARD_BODY,
  PROVIDER_EXCELLENCE_DASHBOARD_COOLDOWN_MS,
  PROVIDER_EXCELLENCE_DASHBOARD_CTA,
  PROVIDER_EXCELLENCE_DASHBOARD_STORAGE_KEY,
  PROVIDER_EXCELLENCE_DASHBOARD_TITLE,
} from "@beautonomi/utils";

function readDismissedAt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROVIDER_EXCELLENCE_DASHBOARD_STORAGE_KEY);
    if (!raw) return null;
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

export function ProviderDashboardExcellenceBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = readDismissedAt();
    if (!dismissed) {
      setVisible(true);
      return;
    }
    if (Date.now() - dismissed > PROVIDER_EXCELLENCE_DASHBOARD_COOLDOWN_MS) {
      setVisible(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(PROVIDER_EXCELLENCE_DASHBOARD_STORAGE_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div className="mb-4 sm:mb-6 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50/90 to-orange-50/80 p-4 shadow-sm">
      <div className="flex gap-3">
        <div className="shrink-0 rounded-lg bg-amber-100/80 p-2 text-amber-800">
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-amber-950">{PROVIDER_EXCELLENCE_DASHBOARD_TITLE}</h3>
            <button
              type="button"
              onClick={dismiss}
              className="shrink-0 rounded-md p-1 text-amber-800/70 hover:bg-amber-100/80 hover:text-amber-950"
              aria-label="Dismiss tip"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-amber-950/85">{PROVIDER_EXCELLENCE_DASHBOARD_BODY}</p>
          <Link
            href="/provider/gamification"
            className="mt-3 inline-flex text-sm font-medium text-amber-900 underline-offset-4 hover:underline"
          >
            {PROVIDER_EXCELLENCE_DASHBOARD_CTA} →
          </Link>
        </div>
      </div>
    </div>
  );
}
