import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
  requireAuthInApi,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { recordLoyaltyRedemption } from "@/lib/loyalty/record-redemption";
import { resolveLoyaltyConfig } from "@/lib/loyalty/resolve-loyalty-config";

const redeemSchema = z.object({
  points: z.number().min(1, "Points must be at least 1"),
  description: z.string().optional(),
  idempotency_key: z.string().trim().min(8).max(128).optional(),
});

const COMPENSATION_SOURCE = "self_service_wallet_redeem_compensation";

type PriorRedemption = {
  points: number;
  walletCreditAmount: number;
  currency: string;
  compensated: boolean;
};

/** Earlier redemption recorded under this key (and whether its points were already given back). */
async function findPriorRedemption(
  admin: SupabaseClient,
  customerId: string,
  key: string,
): Promise<PriorRedemption | null> {
  const { data: redeemed } = await admin
    .from("loyalty_points_ledger")
    .select("points_amount, metadata")
    .eq("customer_id", customerId)
    .eq("transaction_type", "redeemed")
    .eq("metadata->>redeem_idempotency_key", key)
    .limit(1)
    .maybeSingle();
  if (!redeemed) return null;

  const { data: compensation } = await admin
    .from("loyalty_points_ledger")
    .select("id")
    .eq("customer_id", customerId)
    .eq("transaction_type", "adjusted")
    .eq("metadata->>redeem_idempotency_key", key)
    .limit(1)
    .maybeSingle();

  const row = redeemed as { points_amount?: number; metadata?: Record<string, unknown> | null };
  const meta = row.metadata ?? {};
  return {
    points: Math.abs(Number(row.points_amount ?? 0)),
    walletCreditAmount: Number(meta.wallet_credit_amount ?? 0),
    currency: String(meta.currency ?? LAST_RESORT_CURRENCY),
    compensated: Boolean(compensation),
  };
}

/**
 * POST /api/me/loyalty/redeem
 *
 * Redeem loyalty points for wallet credit. Send `idempotency_key` (or an
 * `Idempotency-Key` header) so a double-tap or retry redeems once: a repeat
 * returns the original result and completes a wallet credit that did not land.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const body = await request.json();
    const validated = redeemSchema.parse(body);
    const headerKey = request.headers.get("Idempotency-Key")?.trim();
    const idempotencyKey =
      validated.idempotency_key ||
      (headerKey && headerKey.length >= 8 && headerKey.length <= 128 ? headerKey : undefined);

    const supabase = await getSupabaseServer(request);
    const adminSupabase = getSupabaseAdmin();

    const { data: redeemUserRow } = await adminSupabase
      .from("users")
      .select("preferred_home_tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    const redeemTenantId =
      (redeemUserRow as { preferred_home_tenant_id?: string | null } | null)?.preferred_home_tenant_id ??
      null;

    const redeemWalletTenantId = await resolveTenantIdForFinanceLedger(adminSupabase, {
      tenant_id: redeemTenantId,
      provider_id: null,
    });

    const replay = async () => {
      const prior = idempotencyKey
        ? await findPriorRedemption(adminSupabase, user.id, idempotencyKey)
        : null;
      if (!prior) return null;
      if (prior.compensated) {
        return errorResponse(
          "This redemption failed earlier and your points were returned. Please try again.",
          "REDEMPTION_PREVIOUSLY_FAILED",
          409,
        );
      }
      if (prior.walletCreditAmount > 0) {
        const { error: healError } = await (adminSupabase.rpc as any)("wallet_credit_admin", {
          p_user_id: user.id,
          p_amount: prior.walletCreditAmount,
          p_currency: prior.currency,
          p_description: `Loyalty points redemption: ${prior.points} points`,
          p_reference_id: null,
          p_reference_type: "loyalty_redeem",
          p_tenant_id: redeemWalletTenantId,
          p_idempotency_key: `loyalty_redeem:${user.id}:${idempotencyKey}`,
        });
        if (healError) {
          console.error("Loyalty redeem replay wallet credit failed:", healError);
          return handleApiError(
            healError instanceof Error ? healError : new Error("Wallet credit failed"),
            "Redemption is being processed. Please try again.",
            "REDEMPTION_PENDING",
            500,
          );
        }
      }
      return successResponse({
        transaction: null,
        points_redeemed: prior.points,
        redemption_value: prior.walletCreditAmount,
        currency: prior.currency,
        replayed: true,
        message: "Points redeemed successfully",
      });
    };

    const replayed = await replay();
    if (replayed) return replayed;

    let currentBalance = 0;
    try {
      const { data: ledgerBalance } = await supabase.rpc(
        "get_customer_available_points",
        { customer_uuid: user.id },
      );
      currentBalance = Number(ledgerBalance) || 0;
    } catch {
      currentBalance = 0;
    }

    if (validated.points > currentBalance) {
      return handleApiError(
        new Error("Insufficient points"),
        "You don't have enough points to redeem this amount",
        "INSUFFICIENT_POINTS",
        400
      );
    }

    const tenantFallback =
      redeemTenantId ? (await getTenantRegionConfig(redeemTenantId))?.defaultCurrency : null;
    const currency = tenantFallback || LAST_RESORT_CURRENCY;
    const loyaltyCfg = await resolveLoyaltyConfig(adminSupabase, currency);

    if (validated.points < loyaltyCfg.minRedemptionPoints) {
      return handleApiError(
        new Error(`Minimum ${loyaltyCfg.minRedemptionPoints} loyalty points required`),
        `You need at least ${loyaltyCfg.minRedemptionPoints} points to redeem.`,
        "VALIDATION_ERROR",
        400,
      );
    }

    const redemptionRate = loyaltyCfg.redemptionRate;
    const redemptionValue = validated.points / redemptionRate;

    const redemptionDescription =
      validated.description ||
      `Redeemed ${validated.points} points for ${redemptionValue.toFixed(2)} ${currency} wallet credit`;

    const redemptionResult = await recordLoyaltyRedemption(adminSupabase, {
      customerId: user.id,
      points: validated.points,
      description: redemptionDescription,
      metadata: {
        source: "self_service_wallet_redeem",
        wallet_credit_amount: redemptionValue,
        currency,
        ...(idempotencyKey ? { redeem_idempotency_key: idempotencyKey } : {}),
      },
    });

    if (!redemptionResult.recorded && redemptionResult.reason === "duplicate_idempotency_key") {
      const concurrent = await replay();
      if (concurrent) return concurrent;
    }

    if (!redemptionResult.recorded) {
      if (redemptionResult.reason === "insufficient_balance") {
        return handleApiError(
          new Error("Insufficient points"),
          "You don't have enough points to redeem this amount",
          "INSUFFICIENT_POINTS",
          400,
        );
      }
      return handleApiError(
        new Error(`Loyalty ledger redemption failed: ${redemptionResult.reason ?? "unknown"}`),
        "Redemption failed. Please try again.",
        "LOYALTY_LEDGER_FAILED",
        500
      );
    }

    const walletIdempotencyKey = idempotencyKey
      ? `loyalty_redeem:${user.id}:${idempotencyKey}`
      : redemptionResult.ledgerId
        ? `loyalty_redeem:ledger:${redemptionResult.ledgerId}`
        : null;

    const { error: walletError } = await (adminSupabase.rpc as any)("wallet_credit_admin", {
      p_user_id: user.id,
      p_amount: redemptionValue,
      p_currency: currency,
      p_description: `Loyalty points redemption: ${validated.points} points`,
      p_reference_id: null,
      p_reference_type: "loyalty_redeem",
      p_tenant_id: redeemWalletTenantId,
      p_idempotency_key: walletIdempotencyKey,
    });

    if (walletError) {
      await (adminSupabase.rpc as any)("append_loyalty_ledger_entry", {
        p_customer_id: user.id,
        p_transaction_type: "adjusted",
        p_points_amount: validated.points,
        p_booking_id: null,
        p_description: `Reversed failed wallet credit for loyalty redemption: ${validated.points} points`,
        p_metadata: {
          source: COMPENSATION_SOURCE,
          failed_wallet_credit_amount: redemptionValue,
          currency,
          ...(idempotencyKey ? { redeem_idempotency_key: idempotencyKey } : {}),
        },
        p_expires_at: null,
      });
      console.error("Failed to credit wallet on loyalty redeem:", walletError);
      return handleApiError(
        walletError instanceof Error ? walletError : new Error("Wallet credit failed"),
        "Redemption failed. Please try again.",
        "WALLET_CREDIT_FAILED",
        500
      );
    }

    return successResponse({
      transaction: null,
      points_redeemed: validated.points,
      redemption_value: redemptionValue,
      currency,
      new_balance: Math.max(0, currentBalance - validated.points),
      message: "Points redeemed successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map(e => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to redeem points");
  }
}
