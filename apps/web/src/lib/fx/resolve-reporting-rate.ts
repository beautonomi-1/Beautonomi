import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ReportingRateSource =
  | "identity"
  | "manual"
  | "frankfurter"
  | "frankfurter_ecb"
  | "open_er_api"
  | "legacy_fx_rates"
  | "derived_inverse"
  | "derived_zar_pivot";

export type ResolveReportingRateResult = {
  base: string;
  quote: string;
  at: string;
  rate: number | null;
  source: ReportingRateSource;
  rateDate?: string;
};

export type FxRateLookup = {
  base: string;
  quote: string;
  at?: Date;
};

const STALE_DAYS = 7;

export function isFxRateStale(rateDate: string | undefined): boolean {
  if (!rateDate) return true;
  const d = new Date(`${rateDate}T12:00:00.000Z`);
  return Date.now() - d.getTime() > STALE_DAYS * 24 * 60 * 60 * 1000;
}

async function hasReferenceLeg(
  admin: ReturnType<typeof getSupabaseAdmin>,
  base: string,
  quote: string,
  atDate: string,
): Promise<boolean> {
  const { count } = await admin
    .from("fx_reference_rates")
    .select("id", { count: "exact", head: true })
    .eq("base_currency", base)
    .eq("quote_currency", quote)
    .lte("rate_date", atDate);
  return (count ?? 0) > 0;
}

async function usesZarPivotFromReference(
  admin: ReturnType<typeof getSupabaseAdmin>,
  base: string,
  quote: string,
  atDate: string,
): Promise<boolean> {
  if (quote === "ZAR") return hasReferenceLeg(admin, base, "ZAR", atDate);
  if (base === "ZAR") return hasReferenceLeg(admin, quote, "ZAR", atDate);
  const [legBase, legQuote] = await Promise.all([
    hasReferenceLeg(admin, base, "ZAR", atDate),
    hasReferenceLeg(admin, quote, "ZAR", atDate),
  ]);
  return legBase && legQuote;
}

async function activeManualHoldRow(
  admin: ReturnType<typeof getSupabaseAdmin>,
  base: string,
  quote: string,
  atDate: string,
) {
  const { data } = await admin
    .from("fx_reference_rates")
    .select("rate_date")
    .eq("base_currency", base)
    .eq("quote_currency", quote)
    .eq("source", "manual")
    .not("hold_until", "is", null)
    .gte("hold_until", atDate)
    .lte("rate_date", atDate)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { rate_date?: string } | null;
}

async function directReferenceAttribution(
  admin: ReturnType<typeof getSupabaseAdmin>,
  base: string,
  quote: string,
  atDate: string,
): Promise<{ rateDate: string; source: ReportingRateSource } | null> {
  const { data: bestDateRow } = await admin
    .from("fx_reference_rates")
    .select("rate_date")
    .eq("base_currency", base)
    .eq("quote_currency", quote)
    .lte("rate_date", atDate)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!bestDateRow?.rate_date) return null;

  const bestDate = String(bestDateRow.rate_date);
  const { data: rows } = await admin
    .from("fx_reference_rates")
    .select("source")
    .eq("base_currency", base)
    .eq("quote_currency", quote)
    .eq("rate_date", bestDate);

  const sources = (rows ?? []).map((r) =>
    String((r as { source?: string }).source ?? "frankfurter"),
  );
  if (sources.includes("manual")) {
    return { rateDate: bestDate, source: "manual" };
  }
  const src = (sources[0] ?? "frankfurter") as ReportingRateSource;
  return { rateDate: bestDate, source: src };
}

async function legacyFxRateDate(
  admin: ReturnType<typeof getSupabaseAdmin>,
  base: string,
  quote: string,
  atIso: string,
): Promise<string | null> {
  const { data: direct } = await admin
    .from("fx_rates")
    .select("as_of")
    .eq("base", base)
    .eq("quote", quote)
    .lte("as_of", atIso)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (direct?.as_of) return String(direct.as_of).slice(0, 10);

  const { data: inverse } = await admin
    .from("fx_rates")
    .select("as_of")
    .eq("base", quote)
    .eq("quote", base)
    .lte("as_of", atIso)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inverse?.as_of) return String(inverse.as_of).slice(0, 10);
  return null;
}

export async function resolveReportingRate(
  lookup: FxRateLookup,
): Promise<ResolveReportingRateResult> {
  const normBase = lookup.base.trim().toUpperCase();
  const normQuote = lookup.quote.trim().toUpperCase();
  const at = lookup.at ?? new Date();
  const atIso = at.toISOString();

  if (normBase === normQuote) {
    return {
      base: normBase,
      quote: normQuote,
      at: atIso,
      rate: 1,
      source: "identity",
      rateDate: atIso.slice(0, 10),
    };
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("get_fx_rate", {
    p_base: normBase,
    p_quote: normQuote,
    p_at: atIso,
  });

  if (error) {
    console.warn("[fx] resolveReportingRate rpc failed:", error.message);
    return { base: normBase, quote: normQuote, at: atIso, rate: null, source: "legacy_fx_rates" };
  }

  const rate = data == null ? null : Number(data);
  if (rate == null || !Number.isFinite(rate)) {
    return { base: normBase, quote: normQuote, at: atIso, rate: null, source: "legacy_fx_rates" };
  }

  const atDate = atIso.slice(0, 10);

  const holdRow = await activeManualHoldRow(admin, normBase, normQuote, atDate);
  if (holdRow?.rate_date) {
    return {
      base: normBase,
      quote: normQuote,
      at: atIso,
      rate,
      source: "manual",
      rateDate: String(holdRow.rate_date),
    };
  }

  const direct = await directReferenceAttribution(admin, normBase, normQuote, atDate);
  if (direct) {
    return {
      base: normBase,
      quote: normQuote,
      at: atIso,
      rate,
      source: direct.source,
      rateDate: direct.rateDate,
    };
  }

  const inv = await admin
    .from("fx_reference_rates")
    .select("rate_date")
    .eq("base_currency", normQuote)
    .eq("quote_currency", normBase)
    .lte("rate_date", atIso.slice(0, 10))
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inv.data?.rate_date) {
    return {
      base: normBase,
      quote: normQuote,
      at: atIso,
      rate,
      source: "derived_inverse",
      rateDate: String(inv.data.rate_date),
    };
  }

  if (await usesZarPivotFromReference(admin, normBase, normQuote, atDate)) {
    const pivotDate =
      normQuote === "ZAR"
        ? (
            await admin
              .from("fx_reference_rates")
              .select("rate_date")
              .eq("base_currency", normBase)
              .eq("quote_currency", "ZAR")
              .lte("rate_date", atDate)
              .order("rate_date", { ascending: false })
              .limit(1)
              .maybeSingle()
          ).data?.rate_date
        : normBase === "ZAR"
          ? (
              await admin
                .from("fx_reference_rates")
                .select("rate_date")
                .eq("base_currency", normQuote)
                .eq("quote_currency", "ZAR")
                .lte("rate_date", atDate)
                .order("rate_date", { ascending: false })
                .limit(1)
                .maybeSingle()
            ).data?.rate_date
          : atDate;

    return {
      base: normBase,
      quote: normQuote,
      at: atIso,
      rate,
      source: "derived_zar_pivot",
      rateDate: pivotDate ? String(pivotDate) : atDate,
    };
  }

  const legacyDate = await legacyFxRateDate(admin, normBase, normQuote, atIso);
  if (legacyDate) {
    return {
      base: normBase,
      quote: normQuote,
      at: atIso,
      rate,
      source: "legacy_fx_rates",
      rateDate: legacyDate,
    };
  }

  return {
    base: normBase,
    quote: normQuote,
    at: atIso,
    rate,
    source: "derived_zar_pivot",
  };
}
