import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { logger } from "@/lib/utils/logger";
import { expectedGatewayFee } from "@/lib/payments/expected-gateway-fee";
import { resolveLedgerCurrency } from "@/lib/ledger/resolve-ledger-currency";

/**
 * Insert a finance_transactions row of type 'payout' when a payout is completed.
 * This keeps the ledger in sync so getAvailablePayoutBalance correctly subtracts paid-out amounts.
 * Idempotent: if a row with this payout_id already exists, we skip (unique on payout_id).
 *
 * §Wave 5.2: wrapped in a Sentry span so we can see payout-ledger write
 * latency and failures in Performance without exposing PII (we only tag
 * non-sensitive IDs + amount metadata; no bank details, no user emails).
 *
 * §Phase 4: the Paystack transfer fee (R3 per transfer) is now recorded in
 * the `fees` column. Pass `transferFeeMajor` when the fee is known from the
 * transfer response; when omitted, the expected fee is looked up from
 * `payment_gateway_fee_configs` (migration 727).
 */
export async function recordPayoutLedger(
  supabase: SupabaseClient,
  payout: {
    id: string;
    provider_id: string;
    net_amount: number;
    amount: number;
    payout_number?: string;
    /** Paystack transfer fee in major currency units (e.g. Rands). When not
     *  provided, falls back to expectedGatewayFee from config (R3 for ZA). */
    transferFeeMajor?: number;
    /** payouts.currency when known; otherwise resolved from the provider tenant. */
    currency?: string | null;
  }
): Promise<void> {
  const amount = Number(payout.net_amount ?? payout.amount ?? 0);
  if (amount <= 0) return;

  // Resolve the transfer fee — real value if provided, config-driven fallback otherwise.
  let transferFee = 0;
  if (payout.transferFeeMajor !== undefined && payout.transferFeeMajor >= 0) {
    transferFee = payout.transferFeeMajor;
  } else {
    try {
      transferFee = await expectedGatewayFee(supabase, "paystack", amount, {
        method: "bank_transfer",
        scope: "transfer",
      });
    } catch {
      // Best-effort: if config lookup fails, log and proceed with 0
      logger.warn("recordPayoutLedger.transferFee_lookup_failed", { payoutId: payout.id });
    }
  }

  await Sentry.startSpan(
    {
      name: "finance.recordPayoutLedger",
      op: "finance.ledger.write",
      attributes: {
        "finance.transaction_type": "payout",
        "finance.payout_id": payout.id,
        "finance.provider_id": payout.provider_id,
        "finance.amount": amount,
        "finance.transfer_fee": transferFee,
      },
    },
    async () => {
      const tenantId = await resolveTenantIdForFinanceLedger(supabase, {
        tenant_id: null,
        provider_id: payout.provider_id,
      });
      const currency = await resolveLedgerCurrency(supabase, {
        currency: payout.currency ?? null,
        tenantId,
      });

      const { error } = await (supabase.from("finance_transactions") as any)
        .insert({
          tenant_id: tenantId,
          provider_id: payout.provider_id,
          payout_id: payout.id,
          transaction_type: "payout",
          amount,
          fees: transferFee,
          commission: 0,
          net: amount,
          currency,
          description: `Payout ${payout.payout_number || payout.id}`,
          created_at: new Date().toISOString(),
        });

      if (error) {
        if (
          error.code === "23505" ||
          error.message?.includes("unique") ||
          error.message?.includes("duplicate")
        ) {
          logger.info("recordPayoutLedger.idempotent_skip", {
            payoutId: payout.id,
            providerId: payout.provider_id,
          });
          return;
        }
        logger.error("recordPayoutLedger.failed", error, {
          payoutId: payout.id,
          providerId: payout.provider_id,
          amount,
        });
        throw error;
      }

      logger.info("recordPayoutLedger.success", {
        payoutId: payout.id,
        providerId: payout.provider_id,
        amount,
        transferFee,
      });
    },
  );
}

/**
 * Record the Paystack R3 transfer fee as a standalone expense finance_transaction
 * for FAILED or REVERSED transfers. Paystack charges the fee even when the
 * transfer does not succeed, so the platform must absorb the cost regardless.
 *
 * Best-effort: does not throw if the insert fails (the failed payout path must
 * not block on a non-critical fee write).
 */
export async function recordFailedPayoutTransferFee(
  supabase: SupabaseClient,
  payout: {
    id: string;
    provider_id: string;
    amount: number;
    payout_number?: string;
    currency?: string | null;
  },
): Promise<void> {
  let transferFee = 0;
  try {
    transferFee = await expectedGatewayFee(supabase, "paystack", Number(payout.amount ?? 0), {
      method: "bank_transfer",
      scope: "transfer",
    });
  } catch {
    logger.warn("recordFailedPayoutTransferFee.fee_lookup_failed", { payoutId: payout.id });
    return; // Nothing to record if we can't determine the fee
  }

  if (transferFee <= 0) return;

  try {
    const tenantId = await resolveTenantIdForFinanceLedger(supabase, {
      tenant_id: null,
      provider_id: payout.provider_id,
    });
    const currency = await resolveLedgerCurrency(supabase, {
      currency: payout.currency ?? null,
      tenantId,
    });

    await (supabase.from("finance_transactions") as any).insert({
      tenant_id: tenantId,
      provider_id: payout.provider_id,
      payout_id: payout.id,
      transaction_type: "payout_transfer_fee",
      amount: transferFee,
      fees: transferFee,
      commission: 0,
      net: 0,
      currency,
      description: `Paystack transfer fee (failed payout ${payout.payout_number || payout.id})`,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn("recordFailedPayoutTransferFee.insert_failed", { payoutId: payout.id, err });
  }
}
