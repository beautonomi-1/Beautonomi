import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { logger } from "@/lib/utils/logger";

/**
 * Insert a finance_transactions row of type 'payout' when a payout is completed.
 * This keeps the ledger in sync so getAvailablePayoutBalance correctly subtracts paid-out amounts.
 * Idempotent: if a row with this payout_id already exists, we skip (unique on payout_id).
 *
 * §Wave 5.2: wrapped in a Sentry span so we can see payout-ledger write
 * latency and failures in Performance without exposing PII (we only tag
 * non-sensitive IDs + amount metadata; no bank details, no user emails).
 */
export async function recordPayoutLedger(
  supabase: SupabaseClient,
  payout: { id: string; provider_id: string; net_amount: number; amount: number; payout_number?: string }
): Promise<void> {
  const amount = Number(payout.net_amount ?? payout.amount ?? 0);
  if (amount <= 0) return;

  await Sentry.startSpan(
    {
      name: "finance.recordPayoutLedger",
      op: "finance.ledger.write",
      attributes: {
        "finance.transaction_type": "payout",
        "finance.payout_id": payout.id,
        "finance.provider_id": payout.provider_id,
        "finance.amount": amount,
      },
    },
    async () => {
      const tenantId = await resolveTenantIdForFinanceLedger(supabase, {
        tenant_id: null,
        provider_id: payout.provider_id,
      });

      const { error } = await (supabase.from("finance_transactions") as any)
        .insert({
          tenant_id: tenantId,
          provider_id: payout.provider_id,
          payout_id: payout.id,
          transaction_type: "payout",
          amount,
          fees: 0,
          commission: 0,
          net: amount,
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
      });
    },
  );
}
