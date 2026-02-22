/**
 * Transfer Event Handlers
 *
 * Handles Paystack transfer webhook events:
 *   - transfer.success   — Payout completed successfully
 *   - transfer.failed    — Payout failed
 *   - transfer.reversed  — Payout was reversed
 *   - Other transfer.*   — Stored for audit trail
 */
import { NextResponse } from "next/server";
import type { PaystackEvent, SupabaseClient } from "./shared";

// ─── Exported Handler ────────────────────────────────────────────────────────

/**
 * Handle all transfer.* events — update payout records.
 */
export async function handleTransferEvent(
  event: PaystackEvent,
  supabase: SupabaseClient,
): Promise<NextResponse> {
  const { event: eventType, data } = event;

  const transferCode =
    data?.transfer_code || data?.transferCode || data?.transfer?.transfer_code;
  const reference = data?.reference || data?.transfer?.reference;

  if (!transferCode && !reference) {
    console.log(`Transfer event missing transfer_code/reference: ${eventType}`);
    return NextResponse.json({ received: true });
  }

  // Find payout by transfer_code first, then fallback to reference
  const { data: payout } = await (supabase.from("payouts") as any)
    .select("*")
    .or(
      [
        transferCode ? `transfer_code.eq.${transferCode}` : null,
        transferCode ? `payout_provider_transaction_id.eq.${transferCode}` : null,
        reference ? `payout_provider_transaction_id.eq.${reference}` : null,
      ]
        .filter(Boolean)
        .join(","),
    )
    .maybeSingle();

  if (!payout) {
    console.log(
      `No payout found for transfer event ${eventType} (${transferCode || reference})`,
    );
    return NextResponse.json({ received: true });
  }

  const payoutData = payout as any;

  // Idempotency: if already terminal, don't flip
  if (["completed", "failed"].includes(payoutData.status)) {
    return NextResponse.json({ received: true });
  }

  if (eventType === "transfer.success") {
    await (supabase.from("payouts") as any)
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        payout_provider: "paystack",
        payout_provider_transaction_id:
          transferCode || payoutData.payout_provider_transaction_id,
        payout_provider_response: data,
        transfer_code: transferCode || payoutData.transfer_code,
        transfer_id: data?.id || payoutData.transfer_id,
      })
      .eq("id", payoutData.id);

    return NextResponse.json({ received: true });
  }

  if (eventType === "transfer.failed" || eventType === "transfer.reversed") {
    const failureReason =
      data?.reason || data?.message || data?.gateway_response || eventType;
    await (supabase.from("payouts") as any)
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: String(failureReason).slice(0, 500),
        payout_provider: "paystack",
        payout_provider_transaction_id:
          transferCode || payoutData.payout_provider_transaction_id,
        payout_provider_response: data,
        transfer_code: transferCode || payoutData.transfer_code,
        transfer_id: data?.id || payoutData.transfer_id,
      })
      .eq("id", payoutData.id);

    return NextResponse.json({ received: true });
  }

  // Other transfer events: keep as processing but store latest provider response
  await (supabase.from("payouts") as any)
    .update({
      status: payoutData.status || "processing",
      payout_provider: "paystack",
      payout_provider_transaction_id:
        transferCode || payoutData.payout_provider_transaction_id,
      payout_provider_response: data,
      transfer_code: transferCode || payoutData.transfer_code,
      transfer_id: data?.id || payoutData.transfer_id,
    })
    .eq("id", payoutData.id);

  return NextResponse.json({ received: true });
}
