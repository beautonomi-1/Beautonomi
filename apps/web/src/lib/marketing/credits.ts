/**
 * Provider marketing credits — atomic debit/credit with idempotency.
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

export async function getMarketingBalance(
  supabase: SupabaseClient,
  providerId: string,
): Promise<MarketingBalance> {
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
  supabase: SupabaseClient,
  channel: string,
  category = "default",
): Promise<number> {
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
}): Promise<{ ok: true; balance_after: number } | { ok: false; reason: string }> {
  const supabase = input.supabase ?? getSupabaseAdmin();
  if (input.amountZar <= 0) return { ok: false, reason: "amount must be positive" };

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
  const newIncluded = bal.included_balance_zar;
  const newPurchased = bal.purchased_balance_zar + input.amountZar;
  const balanceAfter = newIncluded + newPurchased;

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
}): Promise<{ ok: true; balance_after: number } | { ok: false; reason: string }> {
  const supabase = input.supabase ?? getSupabaseAdmin();
  if (input.amountZar <= 0) return { ok: false, reason: "amount must be positive" };

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
  const supabase = input.supabase ?? getSupabaseAdmin();
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
  supabase: SupabaseClient,
  providerId: string,
  grantZar: number,
  periodKey: string,
): Promise<void> {
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
