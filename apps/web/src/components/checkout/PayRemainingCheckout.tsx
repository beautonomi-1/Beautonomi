"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { normalizeTipPercentPresets, percentOf } from "@beautonomi/utils";
import { formatCurrency } from "@/lib/utils";

type Preview = {
  remaining_balance: number;
  currency: string;
  tips_enabled: boolean;
  service_tip_base: number;
  tip_presets?: number[];
};

type PayRemainingCheckoutProps = {
  bookingId: string;
  /** When set, skip the preview GET (e.g. booking detail already loaded). */
  preview?: Preview | null;
  autoStart?: boolean;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function PayRemainingCheckout({
  bookingId,
  preview: previewProp,
  autoStart = false,
}: PayRemainingCheckoutProps) {
  const [preview, setPreview] = useState<Preview | null>(previewProp ?? null);
  const [loadingPreview, setLoadingPreview] = useState(!previewProp);
  const [tipMode, setTipMode] = useState<number | "custom">(0);
  const [customTip, setCustomTip] = useState("");
  const [paying, setPaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (previewProp) {
      setPreview(previewProp);
      setLoadingPreview(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingPreview(true);
      try {
        const res = await fetcher.get<{ data?: Preview }>(
          `/api/me/bookings/${bookingId}/pay-remaining`,
        );
        if (!cancelled) setPreview(res.data ?? null);
      } catch (e) {
        if (!cancelled) {
          setErrorMsg(e instanceof FetchError ? e.message : "Could not load payment details.");
        }
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, previewProp]);

  const tipPresets = useMemo(
    () => normalizeTipPercentPresets(preview?.tip_presets),
    [preview?.tip_presets],
  );

  const tipAmount = useMemo(() => {
    if (!preview?.tips_enabled) return 0;
    if (tipMode === "custom") {
      return roundMoney(Math.max(0, Number(customTip) || 0));
    }
    if (tipMode === 0) return 0;
    return percentOf(preview.service_tip_base, tipMode, preview.currency);
  }, [preview, tipMode, customTip]);

  const payTotal = roundMoney((preview?.remaining_balance ?? 0) + tipAmount);

  const startPay = useCallback(async () => {
    if (!preview) return;
    setPaying(true);
    setErrorMsg(null);
    try {
      const res = await fetcher.post<{
        data?: { authorization_url?: string; fully_settled?: boolean };
      }>(
        `/api/me/bookings/${bookingId}/pay-remaining`,
        { tip_amount: tipAmount },
        { timeoutMs: 120_000 },
      );
      if (res.data?.fully_settled) {
        window.location.href = `/account-settings/bookings/${bookingId}`;
        return;
      }
      const url = res.data?.authorization_url;
      if (!url) throw new Error("Payment could not be started.");
      window.location.href = url;
    } catch (e) {
      setPaying(false);
      setErrorMsg(
        e instanceof FetchError ? e.message : e instanceof Error ? e.message : "Could not start payment.",
      );
    }
  }, [bookingId, preview, tipAmount]);

  useEffect(() => {
    if (autoStart && preview && !preview.tips_enabled && !paying) {
      void startPay();
    }
  }, [autoStart, preview, paying, startPay]);

  if (loadingPreview) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Loading payment details…</p>
      </div>
    );
  }

  if (errorMsg && !preview) {
    return <p className="text-red-600 text-center py-6">{errorMsg}</p>;
  }

  if (!preview) return null;

  if (autoStart && !preview.tips_enabled) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Starting secure payment…</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6 py-6 px-4">
      <div className="text-center space-y-1">
        <p className="text-lg font-semibold">Balance due</p>
        <p className="text-2xl font-bold">
          {preview.currency} {preview.remaining_balance.toFixed(2)}
        </p>
      </div>

      {preview.tips_enabled && preview.service_tip_base > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Add a tip (optional)</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={tipMode === 0 ? "default" : "outline"}
              size="sm"
              onClick={() => setTipMode(0)}
            >
              No tip
            </Button>
            {tipPresets.map((p) => {
              const computed = percentOf(preview.service_tip_base, p, preview.currency);
              return (
                <Button
                  key={p}
                  type="button"
                  variant={tipMode === p ? "default" : "outline"}
                  size="sm"
                  className="flex flex-col h-auto py-2 min-h-[44px]"
                  onClick={() => setTipMode(p)}
                  aria-label={`${p}% tip, ${formatCurrency(computed, preview.currency)}`}
                >
                  <span className="font-bold leading-tight">{p}%</span>
                  <span className="text-[11px] opacity-90 leading-tight">
                    {formatCurrency(computed, preview.currency)}
                  </span>
                </Button>
              );
            })}
            <Button
              type="button"
              variant={tipMode === "custom" ? "default" : "outline"}
              size="sm"
              onClick={() => setTipMode("custom")}
            >
              Custom
            </Button>
          </div>
          {tipMode === "custom" ? (
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={customTip}
              onChange={(e) => setCustomTip(e.target.value)}
              placeholder="Enter tip amount"
            />
          ) : null}
        </div>
      ) : null}

      {errorMsg ? <p className="text-red-600 text-sm text-center">{errorMsg}</p> : null}

      <Button className="w-full" disabled={paying || payTotal <= 0} onClick={() => void startPay()}>
        {paying ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Starting secure payment…
          </>
        ) : (
          `Pay ${preview.currency} ${payTotal.toFixed(2)}`
        )}
      </Button>
    </div>
  );
}
