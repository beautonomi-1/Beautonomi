import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadFxPairBuckets,
  type FxPair,
  HQ_REPORTING,
} from "@/lib/fx/fx-pair-requirements";
import { resolveReportingRate, isFxRateStale } from "@/lib/fx/resolve-reporting-rate";

export type FxCoverageRow = {
  base: string;
  quote: string;
  required: boolean;
  rate: number | null;
  rate_date: string | null;
  source: string | null;
  age_days: number | null;
  status: "ok" | "stale" | "missing";
  hold_until: string | null;
  set_by: string | null;
  set_by_email: string | null;
  manual_rate_date: string | null;
  note: string | null;
  used_by_tenants: string[];
  used_by_regions: string[];
  used_for: string[];
};

function ageDays(rateDate: string | null): number | null {
  if (!rateDate) return null;
  const d = new Date(`${rateDate}T12:00:00.000Z`);
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
}

function buildUsedForLabels(
  p: FxPair,
  tenantSlugs: string[],
  _regionCodes: string[],
): string[] {
  const labels: string[] = ["HQ reporting"];
  for (const slug of tenantSlugs) {
    labels.push(`launch:${slug}`);
  }
  if (p.quote === HQ_REPORTING && p.base !== HQ_REPORTING) {
    labels.push("Apple IAP variance");
  }
  if (p.quote === "USD" && p.base !== "USD") {
    labels.push("Apple USD buckets");
  }
  return labels;
}

async function latestManualRow(supabase: SupabaseClient, p: FxPair) {
  const { data } = await supabase
    .from("fx_reference_rates")
    .select("hold_until, note, set_by, rate_date, source")
    .eq("base_currency", p.base)
    .eq("quote_currency", p.quote)
    .eq("source", "manual")
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as {
    hold_until?: string | null;
    note?: string | null;
    set_by?: string | null;
    rate_date?: string;
    source?: string;
  } | null;
}

export async function buildFxCoverageMatrix(
  supabase: SupabaseClient,
): Promise<{ rows: FxCoverageRow[]; requiredOk: number; requiredTotal: number }> {
  const buckets = await loadFxPairBuckets(supabase);
  const requiredKeys = new Set(buckets.required.map((p) => `${p.base}>${p.quote}`));

  const { data: tenants } = await supabase
    .from("tenants")
    .select("slug, default_currency, is_active")
    .eq("is_active", true);
  const { data: regions } = await supabase
    .from("regions")
    .select("code, default_currency, is_active")
    .eq("is_active", true);

  const allPairs = [...buckets.required, ...buckets.watched];
  const rows: FxCoverageRow[] = [];

  const manualRows = await Promise.all(allPairs.map((p) => latestManualRow(supabase, p)));
  const actorIds = [
    ...new Set(manualRows.map((m) => m?.set_by).filter(Boolean) as string[]),
  ];
  const actorEmails: Record<string, string> = {};
  if (actorIds.length > 0) {
    const { data: actors } = await supabase
      .from("users")
      .select("id, email")
      .in("id", actorIds);
    for (const a of actors ?? []) {
      actorEmails[(a as { id: string }).id] = String((a as { email?: string }).email ?? "");
    }
  }

  for (let i = 0; i < allPairs.length; i++) {
    const p = allPairs[i];
    const manual = manualRows[i];
    const resolved = await resolveReportingRate({ base: p.base, quote: p.quote });
    const stale = isFxRateStale(resolved.rateDate ?? null);
    const missing = resolved.rate == null;

    let status: FxCoverageRow["status"] = "ok";
    if (missing) status = "missing";
    else if (stale) status = "stale";

    const tenantSlugs = (tenants ?? [])
      .filter(
        (t) =>
          String((t as { default_currency?: string }).default_currency ?? "").toUpperCase() ===
          p.base,
      )
      .map((t) => String((t as { slug?: string }).slug ?? "tenant"));

    const regionCodes = (regions ?? [])
      .filter(
        (r) =>
          String((r as { default_currency?: string }).default_currency ?? "").toUpperCase() ===
          p.base,
      )
      .map((r) => String((r as { code?: string }).code ?? "region"));

    rows.push({
      base: p.base,
      quote: p.quote,
      required: requiredKeys.has(`${p.base}>${p.quote}`),
      rate: resolved.rate,
      rate_date: resolved.rateDate ?? null,
      source: resolved.source,
      age_days: ageDays(resolved.rateDate ?? null),
      status,
      hold_until: manual?.hold_until ?? null,
      set_by: manual?.set_by ?? null,
      set_by_email: manual?.set_by ? actorEmails[manual.set_by] ?? null : null,
      manual_rate_date: manual?.rate_date ?? null,
      note: manual?.note ?? null,
      used_by_tenants: tenantSlugs,
      used_by_regions: regionCodes,
      used_for: buildUsedForLabels(p, tenantSlugs, regionCodes),
    });
  }

  rows.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return `${a.base}${a.quote}`.localeCompare(`${b.base}${b.quote}`);
  });

  const requiredRows = rows.filter((r) => r.required);
  const requiredOk = requiredRows.filter((r) => r.status === "ok").length;

  return {
    rows,
    requiredOk,
    requiredTotal: requiredRows.length,
  };
}

function formatSelfCheckDetail(
  label: string,
  rate: number | null,
  source: string | undefined,
): string {
  if (rate == null) return `${label} = missing`;
  const derived =
    source === "derived_inverse" || source === "derived_zar_pivot" || source === "legacy_fx_rates";
  const badge = derived ? " [derived]" : "";
  return `${label} = ${rate} (${source ?? "?"})${badge}`;
}

export async function runFxSelfCheck(): Promise<
  Array<{ id: string; ok: boolean; detail: string }>
> {
  const checks: Array<{ id: string; ok: boolean; detail: string }> = [];

  const identity = await resolveReportingRate({
    base: HQ_REPORTING,
    quote: HQ_REPORTING,
  });
  checks.push({
    id: "identity_zar",
    ok: identity.rate === 1,
    detail: `ZAR→ZAR = ${identity.rate ?? "null"}`,
  });

  const usd = await resolveReportingRate({ base: "USD", quote: HQ_REPORTING });
  checks.push({
    id: "usd_zar",
    ok: usd.rate != null && usd.rate > 0,
    detail: formatSelfCheckDetail("USD→ZAR", usd.rate, usd.source),
  });

  if (usd.rate != null) {
    const inv = await resolveReportingRate({ base: HQ_REPORTING, quote: "USD" });
    checks.push({
      id: "inverse_zar_usd",
      ok: inv.rate != null && inv.rate > 0,
      detail: formatSelfCheckDetail("ZAR→USD", inv.rate, inv.source),
    });
  }

  return checks;
}

export async function fetchLastCronRun(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("cron_runs")
    .select("id, job_name, started_at, finished_at, status, error")
    .eq("job_name", "fx-reference-rates")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export type LastIngestSummary = {
  created_at: string;
  status: string | null;
  required_missing: string[];
  stale: string[];
  warnings: string[];
  results_count: number;
};

export async function fetchLastIngestSummary(
  supabase: SupabaseClient,
): Promise<LastIngestSummary | null> {
  const { data } = await supabase
    .from("audit_logs")
    .select("created_at, status, metadata")
    .eq("module", "finance")
    .eq("action", "finance.fx.refresh")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const meta = (data as { metadata?: Record<string, unknown> }).metadata ?? {};
  return {
    created_at: String((data as { created_at: string }).created_at),
    status: (data as { status?: string | null }).status ?? null,
    required_missing: Array.isArray(meta.required_missing)
      ? (meta.required_missing as string[])
      : [],
    stale: Array.isArray(meta.stale) ? (meta.stale as string[]) : [],
    warnings: Array.isArray(meta.warnings) ? (meta.warnings as string[]) : [],
    results_count: typeof meta.results_count === "number" ? meta.results_count : 0,
  };
}
