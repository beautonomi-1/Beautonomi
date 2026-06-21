/**
 * Credit provider marketing balance after successful Paystack charge.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { creditMarketingBalance } from "@/lib/marketing/credits";
import { recordMarketingCreditTopupPayment } from "@/lib/marketing/marketing-credit-topup-payment";

export async function applyMarketingTopupFromPaystackSuccess(input: {
  supabase: SupabaseClient;
  providerId: string;
  amountZar: number;
  /** Paystack fees in major units (ZAR), already converted. */
  feesZar?: number;
  paystackReference: string;
  currency?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ credited: boolean; balance_after?: number }> {
  const { supabase, providerId, amountZar, paystackReference } = input;
  if (!providerId || amountZar <= 0) return { credited: false };

  const idempotencyKey = `marketing_topup:${paystackReference}`;
  const result = await creditMarketingBalance({
    providerId,
    amountZar,
    reason: "topup",
    idempotencyKey,
    metadata: {
      paystack_reference: paystackReference,
      ...(input.metadata ?? {}),
    },
    supabase,
  });

  if (!result.ok) return { credited: false };

  // Attribute the cash received in platform finance (idempotent on reference).
  // Failures here must not unwind the provider's balance credit, so guard it.
  try {
    await recordMarketingCreditTopupPayment({
      supabase,
      providerId,
      reference: paystackReference,
      amountMajor: amountZar,
      feesMajor: input.feesZar ?? 0,
      currency: input.currency ?? null,
      metadata: input.metadata,
    });
  } catch (financeError) {
    console.error("[marketing_topup] finance attribution failed:", financeError);
  }

  return { credited: true, balance_after: result.balance_after };
}
