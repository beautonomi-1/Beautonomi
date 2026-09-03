/**
 * Server-side gift card purchase caps (Part J2).
 *
 * Limits come from `platform_settings.settings.gift_cards` (tenant row first, then
 * the global row) and fall back to safe defaults:
 *   min_amount          50      per-card minimum
 *   max_amount          5000    per-card maximum
 *   max_per_day         10      cards per purchaser per rolling 24h
 *   max_amount_per_day  20000   total value per purchaser per rolling 24h
 *
 * There is no gift_card_templates table (templates are CMS-only), so the platform
 * settings are the single source of truth.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type GiftCardPurchaseCaps = {
  minAmount: number;
  maxAmount: number;
  maxPerDay: number;
  maxAmountPerDay: number;
};

export const DEFAULT_GIFT_CARD_PURCHASE_CAPS: GiftCardPurchaseCaps = {
  minAmount: 50,
  maxAmount: 5000,
  maxPerDay: 10,
  maxAmountPerDay: 20000,
};

export type GiftCardCapViolation =
  | { code: "AMOUNT_BELOW_MIN"; message: string; limit: number }
  | { code: "AMOUNT_ABOVE_MAX"; message: string; limit: number }
  | { code: "DAILY_CARD_LIMIT_REACHED"; message: string; limit: number }
  | { code: "DAILY_AMOUNT_LIMIT_REACHED"; message: string; limit: number };

export type GiftCardCapCheck = { ok: true } | { ok: false; violation: GiftCardCapViolation };

function readPositiveNumber(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function readGiftCardCapsFromSettings(settings: unknown): Partial<GiftCardPurchaseCaps> {
  if (!settings || typeof settings !== "object") return {};
  const gc = (settings as { gift_cards?: Record<string, unknown> }).gift_cards;
  if (!gc || typeof gc !== "object") return {};
  const out: Partial<GiftCardPurchaseCaps> = {};
  const min = readPositiveNumber(gc.min_amount);
  const max = readPositiveNumber(gc.max_amount);
  const perDay = readPositiveNumber(gc.max_per_day);
  const amountPerDay = readPositiveNumber(gc.max_amount_per_day);
  if (min != null) out.minAmount = min;
  if (max != null) out.maxAmount = max;
  if (perDay != null) out.maxPerDay = Math.floor(perDay);
  if (amountPerDay != null) out.maxAmountPerDay = amountPerDay;
  return out;
}

/** Resolve caps: tenant settings override global settings override defaults. */
export async function resolveGiftCardPurchaseCaps(
  supabase: SupabaseClient,
  tenantId: string | null,
): Promise<GiftCardPurchaseCaps> {
  let globalPart: Partial<GiftCardPurchaseCaps> = {};
  let tenantPart: Partial<GiftCardPurchaseCaps> = {};
  try {
    const { data: globalRow } = await supabase
      .from("platform_settings")
      .select("settings")
      .is("tenant_id", null)
      .maybeSingle();
    globalPart = readGiftCardCapsFromSettings((globalRow as { settings?: unknown } | null)?.settings);
    if (tenantId) {
      const { data: tenantRow } = await supabase
        .from("platform_settings")
        .select("settings")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      tenantPart = readGiftCardCapsFromSettings((tenantRow as { settings?: unknown } | null)?.settings);
    }
  } catch (err) {
    console.warn("[gift-card-caps] settings lookup failed; using defaults", err);
  }
  const merged = { ...DEFAULT_GIFT_CARD_PURCHASE_CAPS, ...globalPart, ...tenantPart };
  if (merged.maxAmount < merged.minAmount) merged.maxAmount = merged.minAmount;
  return merged;
}

/** Pure per-card amount check. */
export function checkGiftCardAmount(amount: number, caps: GiftCardPurchaseCaps): GiftCardCapCheck {
  if (!Number.isFinite(amount) || amount < caps.minAmount) {
    return {
      ok: false,
      violation: {
        code: "AMOUNT_BELOW_MIN",
        message: `Gift card amount must be at least ${caps.minAmount}.`,
        limit: caps.minAmount,
      },
    };
  }
  if (amount > caps.maxAmount) {
    return {
      ok: false,
      violation: {
        code: "AMOUNT_ABOVE_MAX",
        message: `Gift card amount cannot exceed ${caps.maxAmount}.`,
        limit: caps.maxAmount,
      },
    };
  }
  return { ok: true };
}

/** Pure per-day check given what the purchaser already bought in the window. */
export function checkGiftCardDailyCaps(
  input: { quantity: number; totalAmount: number; priorCards: number; priorAmount: number },
  caps: GiftCardPurchaseCaps,
): GiftCardCapCheck {
  if (input.priorCards + input.quantity > caps.maxPerDay) {
    return {
      ok: false,
      violation: {
        code: "DAILY_CARD_LIMIT_REACHED",
        message: `You can buy at most ${caps.maxPerDay} gift cards per day.`,
        limit: caps.maxPerDay,
      },
    };
  }
  if (input.priorAmount + input.totalAmount > caps.maxAmountPerDay + 0.005) {
    return {
      ok: false,
      violation: {
        code: "DAILY_AMOUNT_LIMIT_REACHED",
        message: `Gift card purchases are limited to ${caps.maxAmountPerDay} per day.`,
        limit: caps.maxAmountPerDay,
      },
    };
  }
  return { ok: true };
}

/** Sum the purchaser's pending/paid orders in the trailing 24h. */
export async function loadPurchaserDailyGiftCardUsage(
  supabase: SupabaseClient,
  purchaserUserId: string,
  now: Date = new Date(),
): Promise<{ priorCards: number; priorAmount: number }> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("gift_card_orders")
    .select("quantity, total_amount")
    .eq("purchaser_user_id", purchaserUserId)
    .in("status", ["pending", "paid"])
    .gte("created_at", since);
  let priorCards = 0;
  let priorAmount = 0;
  for (const row of (data ?? []) as Array<{ quantity?: number | null; total_amount?: number | string | null }>) {
    priorCards += Number(row.quantity ?? 1);
    priorAmount += Number(row.total_amount ?? 0);
  }
  return { priorCards, priorAmount };
}

/** Full check used by POST /api/public/gift-cards/purchase. */
export async function enforceGiftCardPurchaseCaps(params: {
  supabase: SupabaseClient;
  tenantId: string | null;
  purchaserUserId: string;
  amount: number;
  quantity: number;
  totalAmount: number;
}): Promise<GiftCardCapCheck & { caps: GiftCardPurchaseCaps }> {
  const caps = await resolveGiftCardPurchaseCaps(params.supabase, params.tenantId);
  const amountCheck = checkGiftCardAmount(params.amount, caps);
  if (amountCheck.ok === false) return { ...amountCheck, caps };
  const usage = await loadPurchaserDailyGiftCardUsage(params.supabase, params.purchaserUserId);
  const dailyCheck = checkGiftCardDailyCaps(
    { quantity: params.quantity, totalAmount: params.totalAmount, ...usage },
    caps,
  );
  return { ...dailyCheck, caps };
}
