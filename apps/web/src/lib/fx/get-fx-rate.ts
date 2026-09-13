import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * F18 — Client-side helper for FX conversions in reporting code paths.
 *
 * Uses public.get_fx_rate (migration 890) which reads fx_reference_rates with
 * manual preference, inverse, and ZAR pivot; falls back to legacy fx_rates.
 */
export interface FxRateLookup {
  base: string;
  quote: string;
  at?: Date;
}

const MEMO = new Map<string, { rate: number | null; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

function cacheKey({ base, quote, at }: FxRateLookup) {
  return `${base}>${quote}:${at ? at.toISOString().slice(0, 10) : "now"}`;
}

export function bustFxRateMemo(): void {
  MEMO.clear();
}

export async function getFxRate({ base, quote, at }: FxRateLookup): Promise<number | null> {
  const normBase = base.toUpperCase();
  const normQuote = quote.toUpperCase();
  if (normBase === normQuote) return 1;

  const key = cacheKey({ base: normBase, quote: normQuote, at });
  const cached = MEMO.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("get_fx_rate", {
      p_base: normBase,
      p_quote: normQuote,
      p_at: (at ?? new Date()).toISOString(),
    });
    if (error) {
      console.warn("[fx] get_fx_rate failed:", error.message);
      MEMO.set(key, { rate: null, expiresAt: Date.now() + TTL_MS });
      return null;
    }
    const rate = data == null ? null : Number(data);
    MEMO.set(key, { rate, expiresAt: Date.now() + TTL_MS });
    return rate;
  } catch (error) {
    console.warn("[fx] get_fx_rate threw:", error);
    return null;
  }
}

export async function convertFx(
  amount: number,
  lookup: FxRateLookup,
): Promise<number | null> {
  const rate = await getFxRate(lookup);
  if (rate == null) return null;
  return amount * rate;
}
