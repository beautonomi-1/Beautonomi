import type { SupabaseClient } from "@supabase/supabase-js";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import { upsertOpenPaymentDispute } from "@/lib/bookings/paystack-dispute-lifecycle";
import { processBookingChargeback } from "@/lib/bookings/process-booking-chargeback";

function disputeAmountMajor(data: Record<string, unknown>): number {
  const raw = data.amount ?? data.chargeback_amount ?? data.dispute_amount;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const currency = String(data.currency ?? "ZAR").toUpperCase();
  return n >= 1000 ? convertFromSmallestUnit(n, currency) : n;
}

/**
 * Flutterwave chargeback / dispute webhooks (event names vary by dashboard version).
 */
export async function handleFlutterwaveDisputeWebhook(
  eventType: string,
  data: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<{ handled: boolean }> {
  const normalized = eventType.toLowerCase();
  if (
    !normalized.includes("chargeback") &&
    !normalized.includes("dispute") &&
    normalized !== "charge.dispute"
  ) {
    return { handled: false };
  }

  const disputeId = String(data.id ?? data.chargeback_id ?? data.dispute_id ?? "");
  const reference = String(
    data.tx_ref ?? data.flw_ref ?? data.reference ?? data.transaction_reference ?? "",
  ).trim();
  if (!disputeId || !reference) {
    console.warn("[flutterwave/dispute] missing dispute id or reference", { eventType });
    return { handled: true };
  }

  const currency = String(data.currency ?? "ZAR").toUpperCase();
  const amountMajor = disputeAmountMajor(data);
  const statusRaw = String(data.status ?? normalized).toLowerCase();

  let status: "open" | "awaiting_bank" | "merchant_won" | "customer_won" = "open";
  if (statusRaw.includes("won") && statusRaw.includes("merchant")) status = "merchant_won";
  else if (statusRaw.includes("won") && statusRaw.includes("customer")) status = "customer_won";
  else if (statusRaw.includes("lost")) status = "customer_won";
  else if (statusRaw.includes("resolved")) status = "merchant_won";

  await upsertOpenPaymentDispute({
    supabase,
    paymentProvider: "flutterwave",
    disputeId,
    reference,
    amountMajor,
    currency,
    status,
    resolution: typeof data.comment === "string" ? data.comment : null,
    rawPayload: { eventType, ...data },
  });

  if (status === "customer_won" && amountMajor > 0) {
    try {
      await processBookingChargeback({
        supabase,
        reference,
        amountMajor,
        currency,
        paymentProvider: "flutterwave",
        disputeId,
      });
    } catch (err) {
      console.error("[flutterwave/dispute] processBookingChargeback failed:", err);
    }
  }

  return { handled: true };
}
