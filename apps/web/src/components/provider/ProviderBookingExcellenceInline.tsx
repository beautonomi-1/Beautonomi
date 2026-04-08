"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Home, Sparkles, X } from "lucide-react";
import {
  PROVIDER_EXCELLENCE_DASHBOARD_CTA,
  PROVIDER_HOUSE_CALL_EXCELLENCE_NUDGE,
  PROVIDER_ON_PLATFORM_PAYMENT_NUDGE,
  providerBookingPaymentNudgeSessionKey,
} from "@beautonomi/utils";

export function HouseCallExcellenceNote() {
  return (
    <div className="mb-4 flex gap-3 rounded-lg border border-violet-200/80 bg-white/70 p-3">
      <div className="shrink-0 text-violet-600">
        <Home className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed text-violet-950/90">{PROVIDER_HOUSE_CALL_EXCELLENCE_NUDGE}</p>
        <Link
          href="/provider/gamification"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet-800 underline-offset-4 hover:underline"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {PROVIDER_EXCELLENCE_DASHBOARD_CTA}
        </Link>
      </div>
    </div>
  );
}

export function OnPlatformPaymentNote({ bookingId, show }: { bookingId: string; show: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show || typeof window === "undefined") return;
    try {
      const dismissed = sessionStorage.getItem(providerBookingPaymentNudgeSessionKey(bookingId));
      setVisible(!dismissed);
    } catch {
      setVisible(true);
    }
  }, [bookingId, show]);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(providerBookingPaymentNudgeSessionKey(bookingId), "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, [bookingId]);

  if (!show || !visible) return null;

  return (
    <div className="mb-4 flex gap-2 rounded-lg border border-emerald-200/90 bg-emerald-50/70 p-3">
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-emerald-950/90">{PROVIDER_ON_PLATFORM_PAYMENT_NUDGE}</p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded p-1 text-emerald-800/70 hover:bg-emerald-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
