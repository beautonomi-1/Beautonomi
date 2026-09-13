import type { SupabaseClient } from "@supabase/supabase-js";

export type FxPair = { base: string; quote: string };

export const HQ_REPORTING = "ZAR";

export const ALWAYS_REQUIRED_BASES = ["EUR", "GBP", "USD"] as const;

export type FxPairBuckets = {
  required: FxPair[];
  watched: FxPair[];
  catalogCodes: string[];
};

function pairKey(p: FxPair): string {
  return `${p.base}>${p.quote}`;
}

export function toZarPair(base: string): FxPair {
  return { base: base.toUpperCase(), quote: HQ_REPORTING };
}

/** Required = majors→ZAR + active tenant/region non-ZAR currencies→ZAR. Watched = other active catalog codes. */
export async function loadFxPairBuckets(supabase: SupabaseClient): Promise<FxPairBuckets> {
  const { data: currencyRows } = await supabase
    .from("currencies")
    .select("code")
    .eq("is_active", true);

  const catalogCodes = (currencyRows ?? []).map((r) => String((r as { code: string }).code).toUpperCase());

  const requiredBases = new Set<string>([...ALWAYS_REQUIRED_BASES]);

  const { data: tenants } = await supabase
    .from("tenants")
    .select("default_currency, is_active")
    .eq("is_active", true);

  for (const t of tenants ?? []) {
    const c = String((t as { default_currency?: string }).default_currency ?? "").toUpperCase();
    if (c && c !== HQ_REPORTING) requiredBases.add(c);
  }

  const { data: regions } = await supabase
    .from("regions")
    .select("default_currency, is_active")
    .eq("is_active", true);

  for (const r of regions ?? []) {
    const c = String((r as { default_currency?: string }).default_currency ?? "").toUpperCase();
    if (c && c !== HQ_REPORTING) requiredBases.add(c);
  }

  const required: FxPair[] = [];
  const requiredKeys = new Set<string>();
  for (const base of requiredBases) {
    if (base === HQ_REPORTING) continue;
    const p = toZarPair(base);
    required.push(p);
    requiredKeys.add(pairKey(p));
  }

  const watched: FxPair[] = [];
  for (const code of catalogCodes) {
    if (code === HQ_REPORTING) continue;
    const p = toZarPair(code);
    if (!requiredKeys.has(pairKey(p))) watched.push(p);
  }

  return { required, watched, catalogCodes };
}

export function allIngestTargets(buckets: FxPairBuckets): FxPair[] {
  const seen = new Set<string>();
  const out: FxPair[] = [];
  for (const p of [...buckets.required, ...buckets.watched]) {
    const k = pairKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

export function usdQuoteCodesForBatch(pairs: FxPair[]): string[] {
  const codes = new Set<string>(["ZAR"]);
  for (const p of pairs) {
    if (p.base !== "USD") codes.add(p.base);
  }
  return [...codes];
}
