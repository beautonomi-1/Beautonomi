"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney, normalizeCurrencyCode } from "@beautonomi/utils";
import { useLocale } from "@/components/i18n/LocaleProvider";

type DisplayMoneyResult = {
  chargeAmount: number;
  chargeCurrency: string;
  displayAmount: number | null;
  displayCurrency: string;
  formattedCharge: string;
  formattedDisplay: string | null;
  approxLabel: string | null;
  loading: boolean;
  stale: boolean;
};

// Module-level cache: currency pair → { rate, fetchedAt, rateDate }
// Prevents N components on the same page from making N separate API calls.
const fxRateCache = new Map<
  string,
  { rate: number | null; fetchedAt: number; rateDate?: string }
>();

const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Browse-only indicative display money. Charge currency remains authoritative at checkout.
 */
export function useDisplayMoney(
  amount: number,
  chargeCurrency?: string,
  displayCurrency?: string | null,
): DisplayMoneyResult {
  const locale = useLocale();
  const charge = normalizeCurrencyCode(chargeCurrency ?? locale.chargeCurrency);
  const display = normalizeCurrencyCode(displayCurrency ?? locale.displayCurrency);
  const formatLocale = locale.formatLocale;
  const sameCurrency = charge === display;

  const cacheKey = `${charge}:${display}`;
  const cached = sameCurrency ? null : fxRateCache.get(cacheKey);

  const [rate, setRate] = useState<number | null>(
    sameCurrency ? 1 : cached?.rate ?? null,
  );
  const [rateDate, setRateDate] = useState<string | undefined>(cached?.rateDate);
  const [loading, setLoading] = useState(!sameCurrency && !cached);

  useEffect(() => {
    if (sameCurrency) {
      setRate(1);
      setLoading(false);
      return;
    }

    // Use cached rate if available (even on first render)
    if (cached) {
      setRate(cached.rate);
      setRateDate(cached.rateDate);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/public/fx/indicative?from=${encodeURIComponent(charge)}&to=${encodeURIComponent(display)}`,
    )
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        const next = json?.data?.rate ?? json?.rate;
        const nextRate = typeof next === "number" ? next : null;
        const nextRateDate = json?.data?.rateDate ?? json?.rateDate;
        setRate(nextRate);
        setRateDate(nextRateDate);
        fxRateCache.set(cacheKey, {
          rate: nextRate,
          fetchedAt: Date.now(),
          rateDate: nextRateDate,
        });
      })
      .catch(() => {
        if (!cancelled) setRate(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charge, display, sameCurrency, cacheKey]);

  const formattedCharge = useMemo(
    () => formatMoney(amount, charge, formatLocale),
    [amount, charge, formatLocale],
  );

  const displayAmount = rate != null ? amount * rate : null;
  const formattedDisplay =
    displayAmount != null ? formatMoney(displayAmount, display, formatLocale) : null;

  // Stale if rate date is >7 days old
  const stale = useMemo(() => {
    if (!rateDate) return false;
    const d = new Date(`${rateDate}T12:00:00.000Z`);
    return Date.now() - d.getTime() > STALE_MS;
  }, [rateDate]);

  return {
    chargeAmount: amount,
    chargeCurrency: charge,
    displayAmount,
    displayCurrency: display,
    formattedCharge,
    formattedDisplay,
    approxLabel: sameCurrency ? null : "≈",
    loading,
    stale,
  };
}
