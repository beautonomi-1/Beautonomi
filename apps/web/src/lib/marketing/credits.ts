/**
 * Provider marketing credits — atomic debit/credit with idempotency.
 *
 * The credit tables (`provider_marketing_credits`, `marketing_credit_ledger`,
 * `marketing_channel_pricebook`) are service-role-only at the RLS layer, so all
 * access here goes through the admin client regardless of any caller-supplied
 * client. Debits and credits are executed via the `debit_marketing_credit` /
 * `credit_marketing_credit` SECURITY DEFINER functions (migration 709) so the
 * read → update → ledger-insert happens atomically under a row lock; a thin
 * application-level fallback is kept for environments where the RPC has not yet
 * been applied (e.g. older databases / tests).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type CreditReason =
  | "monthly_grant"
  | "topup"
  | "campaign_send"
  | "automation_send"
  | "admin_adjustment"
  | "refund";

export interface MarketingBalance {
  included_balance_zar: number;
  purchased_balance_zar: number;
  total_zar: number;
}

type CreditOpResult = { ok: true; balance_after: number } | { ok: false; reason: string };

/** True when an RPC error means the function isn't defined in this database yet. */
function isMissingFunctionError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "42883" || // undefined_function
    code === "PGRST202" || // PostgREST: function not found in schema cache
    message.includes("could not find the function") ||
    (message.includes("function") && message.includes("does not exist"))
  );
}

export async function getMarketingBalance(
  _supabase: SupabaseClient | undefined,
  providerId: string,
): Promise<MarketingBalance> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("provider_marketing_credits")
    .select("included_balance_zar, purchased_balance_zar")
    .eq("provider_id", providerId)
    .maybeSingle();

  const included = Number(data?.included_balance_zar ?? 0);
  const purchased = Number(data?.purchased_balance_zar ?? 0);
  return {
    included_balance_zar: included,
    purchased_balance_zar: purchased,
    total_zar: included + purchased,
  };
}

export async function priceFor(
  _supabase: SupabaseClient | undefined,
  channel: string,
  category = "default",
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("marketing_channel_pricebook")
    .select("unit_cost_zar")
    .eq("channel", channel)
    .eq("category", category)
    .maybeSingle();

  if (data?.unit_cost_zar != null) return Number(data.unit_cost_zar);

  const { data: fallback } = await supabase
    .from("marketing_channel_pricebook")
    .select("unit_cost_zar")
    .eq("channel", channel)
    .eq("category", "default")
    .maybeSingle();

  return Number(fallback?.unit_cost_zar ?? 0);
}

async function ensureCreditRow(supabase: SupabaseClient, providerId: string) {
  const { data: existing } = await supabase
    .from("provider_marketing_credits")
    .select("provider_id")
    .eq("provider_id", providerId)
    .maybeSingle();

  if (existing) return;

  await supabase.from("provider_marketing_credits").insert({
    provider_id: providerId,
    included_balance_zar: 0,
    purchased_balance_zar: 0,
    included_grant_zar: 0,
    period_start: new Date().toISOString().slice(0, 10),
  });
}

function parseCreditOpResult(data: unknown): CreditOpResult | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as { ok?: boolean; balance_after?: number | string; reason?: string };
  if (obj.ok === true) return { ok: true, balance_after: Number(obj.balance_after ?? 0) };
  if (obj.ok === false) return { ok: false, reason: obj.reason ?? "operation failed" };
  return null;
}

export async function creditMarketingBalance(input: {
  providerId: string;
  amountZar: number;
  reason: CreditReason;
  idempotencyKey?: string;
  channel?: string;
  category?: string;
  campaignId?: string;
  metadata?: Record<string, unknown>;
  supabase?: SupabaseClient;
}): Promise<CreditOpResult> {
  if (input.amountZar <= 0) return { ok: false, reason: "amount must be positive" };
  const supabase = getSupabaseAdmin();

  const rpc = await supabase.rpc("credit_marketing_credit", {
    p_provider_id: input.providerId,
    p_amount_zar: input.amountZar,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_channel: input.channel ?? null,
    p_category: input.category ?? null,
    p_campaign_id: input.campaignId ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (!rpc.error) {
    const parsed = parseCreditOpResult(rpc.data);
    if (parsed) return parsed;
  } else if (!isMissingFunctionError(rpc.error)) {
    return { ok: false, reason: rpc.error.message };
  }

  return creditMarketingBalanceFallback(input, supabase);
}

async function creditMarketingBalanceFallback(
  input: Parameters<typeof creditMarketingBalance>[0],
  supabase: SupabaseClient,
): Promise<CreditOpResult> {
  await ensureCreditRow(supabase, input.providerId);

  if (input.idempotencyKey) {
    const { data: dup } = await supabase
      .from("marketing_credit_ledger")
      .select("id")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (dup) {
      const bal = await getMarketingBalance(supabase, input.providerId);
      return { ok: true, balance_after: bal.total_zar };
    }
  }

  const bal = await getMarketingBalance(supabase, input.providerId);
  const newPurchased = bal.purchased_balance_zar + input.amountZar;
  const balanceAfter = bal.included_balance_zar + newPurchased;

  const { error: updErr } = await supabase
    .from("provider_marketing_credits")
    .update({ purchased_balance_zar: newPurchased, updated_at: new Date().toISOString() })
    .eq("provider_id", input.providerId);

  if (updErr) return { ok: false, reason: updErr.message };

  await supabase.from("marketing_credit_ledger").insert({
    provider_id: input.providerId,
    delta_zar: input.amountZar,
    reason: input.reason,
    channel: input.channel ?? null,
    category: input.category ?? null,
    campaign_id: input.campaignId ?? null,
    idempotency_key: input.idempotencyKey ?? null,
    balance_after: balanceAfter,
    metadata: input.metadata ?? {},
  });

  return { ok: true, balance_after: balanceAfter };
}

export async function debitMarketingBalance(input: {
  providerId: string;
  amountZar: number;
  reason: CreditReason;
  idempotencyKey: string;
  channel?: string;
  category?: string;
  campaignId?: string;
  queueRowId?: string;
  metadata?: Record<string, unknown>;
  supabase?: SupabaseClient;
}): Promise<CreditOpResult> {
  if (input.amountZar <= 0) return { ok: false, reason: "amount must be positive" };
  const supabase = getSupabaseAdmin();

  const rpc = await supabase.rpc("debit_marketing_credit", {
    p_provider_id: input.providerId,
    p_amount_zar: input.amountZar,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
    p_channel: input.channel ?? null,
    p_category: input.category ?? null,
    p_campaign_id: input.campaignId ?? null,
    p_queue_row_id: input.queueRowId ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (!rpc.error) {
    const parsed = parseCreditOpResult(rpc.data);
    if (parsed) return parsed;
  } else if (!isMissingFunctionError(rpc.error)) {
    return { ok: false, reason: rpc.error.message };
  }

  return debitMarketingBalanceFallback(input, supabase);
}

async function debitMarketingBalanceFallback(
  input: Parameters<typeof debitMarketingBalance>[0],
  supabase: SupabaseClient,
): Promise<CreditOpResult> {
  const { data: dup } = await supabase
    .from("marketing_credit_ledger")
    .select("balance_after")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (dup) {
    return { ok: true, balance_after: Number(dup.balance_after) };
  }

  await ensureCreditRow(supabase, input.providerId);

  const { data: row, error: fetchErr } = await supabase
    .from("provider_marketing_credits")
    .select("included_balance_zar, purchased_balance_zar")
    .eq("provider_id", input.providerId)
    .single();

  if (fetchErr || !row) return { ok: false, reason: "credit row missing" };

  let included = Number(row.included_balance_zar);
  let purchased = Number(row.purchased_balance_zar);
  let remaining = input.amountZar;

  if (included + purchased < remaining) {
    return { ok: false, reason: "insufficient" };
  }

  const fromIncluded = Math.min(included, remaining);
  included -= fromIncluded;
  remaining -= fromIncluded;

  if (remaining > 0) {
    purchased -= remaining;
  }

  const balanceAfter = included + purchased;

  const { error: updErr } = await supabase
    .from("provider_marketing_credits")
    .update({
      included_balance_zar: included,
      purchased_balance_zar: purchased,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_id", input.providerId);

  if (updErr) return { ok: false, reason: updErr.message };

  await supabase.from("marketing_credit_ledger").insert({
    provider_id: input.providerId,
    delta_zar: -input.amountZar,
    reason: input.reason,
    channel: input.channel ?? null,
    category: input.category ?? null,
    campaign_id: input.campaignId ?? null,
    queue_row_id: input.queueRowId ?? null,
    idempotency_key: input.idempotencyKey,
    balance_after: balanceAfter,
    metadata: input.metadata ?? {},
  });

  return { ok: true, balance_after: balanceAfter };
}

/**
 * Claw back purchased marketing credits when a top-up is refunded/charged back.
 *
 * Removes from `purchased_balance_zar` ONLY (never the free included grant),
 * clamped at zero so already-spent credits don't drive the balance negative.
 * Idempotent on `idempotencyKey`. Always writes a ledger row (even a zero-delta
 * one) for a complete audit trail of the reversal attempt.
 */
export async function clawbackPurchasedMarketingBalance(input: {
  providerId: string;
  amountZar: number;
  idempotencyKey: string;
  reason?: CreditReason;
  metadata?: Record<string, unknown>;
  supabase?: SupabaseClient;
}): Promise<{ ok: true; clawed_zar: number; balance_after: number } | { ok: false; reason: string }> {
  const supabase = getSupabaseAdmin();
  if (input.amountZar <= 0) return { ok: false, reason: "amount must be positive" };

  const { data: dup } = await supabase
    .from("marketing_credit_ledger")
    .select("balance_after")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (dup) {
    return { ok: true, clawed_zar: 0, balance_after: Number(dup.balance_after) };
  }

  await ensureCreditRow(supabase, input.providerId);

  const { data: row, error: fetchErr } = await supabase
    .from("provider_marketing_credits")
    .select("included_balance_zar, purchased_balance_zar")
    .eq("provider_id", input.providerId)
    .single();
  if (fetchErr || !row) return { ok: false, reason: "credit row missing" };

  const included = Number(row.included_balance_zar);
  const purchased = Number(row.purchased_balance_zar);
  const clawed = Math.min(purchased, input.amountZar);
  const newPurchased = purchased - clawed;
  const balanceAfter = included + newPurchased;

  const { error: updErr } = await supabase
    .from("provider_marketing_credits")
    .update({
      purchased_balance_zar: newPurchased,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_id", input.providerId);
  if (updErr) return { ok: false, reason: updErr.message };

  await supabase.from("marketing_credit_ledger").insert({
    provider_id: input.providerId,
    delta_zar: -clawed,
    reason: input.reason ?? "refund",
    idempotency_key: input.idempotencyKey,
    balance_after: balanceAfter,
    metadata: input.metadata ?? {},
  });

  return { ok: true, clawed_zar: clawed, balance_after: balanceAfter };
}

export async function grantMonthlyIncludedCredits(
  _supabase: SupabaseClient | undefined,
  providerId: string,
  grantZar: number,
  periodKey: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await ensureCreditRow(supabase, providerId);

  const idempotencyKey = `monthly_grant:${providerId}:${periodKey}`;
  const { data: dup } = await supabase
    .from("marketing_credit_ledger")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (dup) return;

  const { data: row } = await supabase
    .from("provider_marketing_credits")
    .select("purchased_balance_zar")
    .eq("provider_id", providerId)
    .single();

  const purchased = Number(row?.purchased_balance_zar ?? 0);

  await supabase
    .from("provider_marketing_credits")
    .update({
      included_balance_zar: grantZar,
      included_grant_zar: grantZar,
      period_start: periodKey,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_id", providerId);

  await supabase.from("marketing_credit_ledger").insert({
    provider_id: providerId,
    delta_zar: grantZar,
    reason: "monthly_grant",
    idempotency_key: idempotencyKey,
    balance_after: grantZar + purchased,
    metadata: { period: periodKey },
  });
}
