"use client";

import { useMemo } from "react";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { formatCurrency } from "@/lib/locale/currency";

/** Tenant default currency for CSV/PDF report exports (config bundle). */
export function useReportExportCurrency(): string {
  const { bundle } = useConfigBundle();
  return bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
}

/** Same currency as exports, with a stable formatter for report UI tables and cards. */
export function useReportCurrency() {
  const currencyCode = useReportExportCurrency();
  const format = useMemo(
    () => (amount: number | string) => formatCurrency(amount, currencyCode),
    [currencyCode]
  );
  return { currencyCode, format };
}
