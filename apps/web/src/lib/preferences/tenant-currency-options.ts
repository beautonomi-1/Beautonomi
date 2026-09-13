import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  resolveTenantFromRequest,
  resolveTenantIdWithZaFallback,
} from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { mergeBrowseDisplayCurrencyCodes } from "@/lib/preferences/browse-display-currencies";

export type CurrencyPreferenceOptionRow = {
  id: string;
  type: "currency";
  code: string;
  name: string;
  display_order: number;
  metadata?: Record<string, unknown>;
};

type LocalizationSlice = {
  supported_currencies?: unknown;
  default_currency?: unknown;
};

type MergedLocalization = {
  supported_currencies?: string[];
  default_currency?: string;
};

function asTrimmedUpperCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toUpperCase();
  return t.length > 0 ? t : null;
}

function mergeLocalization(
  tenantLoc: LocalizationSlice | null | undefined,
  globalLoc: LocalizationSlice | null | undefined,
): MergedLocalization {
  const g = globalLoc && typeof globalLoc === "object" ? globalLoc : {};
  const t = tenantLoc && typeof tenantLoc === "object" ? tenantLoc : {};

  const tc = Array.isArray(t.supported_currencies) ? t.supported_currencies : null;
  const gc = Array.isArray(g.supported_currencies) ? g.supported_currencies : null;
  const pickList = (tc && tc.length > 0 ? tc : gc) ?? null;
  const supported =
    pickList && pickList.length > 0
      ? pickList.map((c) => asTrimmedUpperCode(c)).filter((c): c is string => !!c)
      : undefined;

  const default_currency =
    asTrimmedUpperCode(t.default_currency) ??
    asTrimmedUpperCode(g.default_currency) ??
    undefined;

  const out: MergedLocalization = {};
  if (supported && supported.length > 0) out.supported_currencies = supported;
  if (default_currency) out.default_currency = default_currency;
  return out;
}

/**
 * Currencies the customer may choose for display preference: intersection of
 * (tenant/global platform_settings.localization.supported_currencies ∪ default
 * ∪ browse display set) with **active** `iso_currencies` rows.
 * Charge currency at checkout is unchanged — these codes are browse-only.
 */
export async function getTenantScopedCurrencyPreferenceOptions(
  request: NextRequest,
): Promise<CurrencyPreferenceOptionRow[]> {
  const admin = getSupabaseAdmin();

  const tenantRow = await resolveTenantFromRequest(request);
  let tenantId = tenantRow?.id ?? "";

  if (!tenantId) {
    try {
      tenantId = await resolveTenantIdWithZaFallback(request);
    } catch {
      tenantId = "";
    }
  }

  let tenantLocalization: LocalizationSlice | undefined;
  if (tenantId) {
    const { data } = await admin
      .from("platform_settings")
      .select("localization")
      .eq("is_active", true)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const loc = (data as { localization?: unknown } | null)?.localization;
    tenantLocalization =
      loc && typeof loc === "object" && !Array.isArray(loc) ? (loc as LocalizationSlice) : undefined;
  }

  const { data: globalRow } = await admin
    .from("platform_settings")
    .select("localization")
    .eq("is_active", true)
    .is("tenant_id", null)
    .maybeSingle();
  const rawGlobal = (globalRow as { localization?: unknown } | null)?.localization;
  const globalLocalization =
    rawGlobal && typeof rawGlobal === "object" && !Array.isArray(rawGlobal)
      ? (rawGlobal as LocalizationSlice)
      : undefined;

  const merged = mergeLocalization(tenantLocalization, globalLocalization);

  const tr = tenantId ? await getTenantRegionConfig(tenantId) : null;
  const regionDefault = asTrimmedUpperCode(tr?.defaultCurrency) ?? LAST_RESORT_CURRENCY;

  const defaultFromSettings = merged.default_currency;
  const effectiveDefault = defaultFromSettings ?? regionDefault;

  const tenantCodes =
    Array.isArray(merged.supported_currencies) && merged.supported_currencies.length > 0
      ? merged.supported_currencies
      : [];
  const uniqueOrdered = mergeBrowseDisplayCurrencyCodes(tenantCodes, effectiveDefault);

  const { data: isoRows, error: isoErr } = await admin
    .from("iso_currencies")
    .select("code, name, symbol")
    .eq("is_active", true)
    .in("code", uniqueOrdered);

  if (isoErr) {
    console.error("[tenant-currency-options] iso_currencies query failed:", isoErr);
  }

  const isoByCode = new Map(
    (isoRows ?? []).map((r: { code: string; name: string; symbol?: string | null }) => [
      String(r.code).toUpperCase(),
      r,
    ]),
  );

  const out: CurrencyPreferenceOptionRow[] = [];
  let displayOrder = 0;
  for (const code of uniqueOrdered) {
    const row = isoByCode.get(code);
    if (!row) continue;
    const meta =
      row.symbol && String(row.symbol).trim()
        ? { symbol: String(row.symbol).trim() }
        : undefined;
    out.push({
      id: `iso-currency-${row.code}`,
      type: "currency",
      code: String(row.code).toUpperCase(),
      name: row.name,
      display_order: displayOrder++,
      ...(meta ? { metadata: meta } : {}),
    });
  }

  if (out.length > 0) return out;

  const { data: fallbackRow } = await admin
    .from("iso_currencies")
    .select("code, name, symbol")
    .eq("is_active", true)
    .eq("code", effectiveDefault)
    .maybeSingle();

  if (fallbackRow) {
    return [
      {
        id: `iso-currency-${fallbackRow.code}`,
        type: "currency",
        code: String(fallbackRow.code).toUpperCase(),
        name: fallbackRow.name,
        display_order: 0,
        ...(fallbackRow.symbol && String(fallbackRow.symbol).trim()
          ? { metadata: { symbol: String(fallbackRow.symbol).trim() } }
          : {}),
      },
    ];
  }

  return [
    {
      id: `fallback-${LAST_RESORT_CURRENCY}`,
      type: "currency",
      code: LAST_RESORT_CURRENCY,
      name: LAST_RESORT_CURRENCY,
      display_order: 0,
    },
  ];
}
