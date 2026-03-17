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
    const updatePayload = {
      status: "completed",
      completed_at: new Date().toISOString(),
      payout_provider: "paystack",
      payout_provider_transaction_id:
        transferCode || payoutData.payout_provider_transaction_id,
      payout_provider_response: data,
      transfer_code: transferCode || payoutData.transfer_code,
      transfer_id: data?.id || payoutData.transfer_id,
    };
    await (supabase.from("payouts") as any)
      .update(updatePayload)
      .eq("id", payoutData.id);

    try {
      const { recordPayoutLedger } = await import("@/lib/provider/record-payout-ledger");
      await recordPayoutLedger(supabase, {
        id: payoutData.id,
        provider_id: payoutData.provider_id,
        net_amount: payoutData.net_amount ?? payoutData.amount,
        amount: payoutData.amount,
        payout_number: payoutData.payout_number,
      });
    } catch (ledgerErr) {
      console.error("Transfer success: failed to record payout ledger:", ledgerErr);
    }

    try {
      const { data: provider } = await supabase
        .from("providers")
        .select("user_id")
        .eq("id", payoutData.provider_id)
        .single();
      const providerUserId = (provider as any)?.user_id;
      if (providerUserId) {
        const { sendToUser } = await import("@/lib/notifications/onesignal");
        const amountStr = (payoutData.amount ?? payoutData.net_amount ?? 0).toLocaleString();
        await sendToUser(
          providerUserId,
          {
            title: "Payout Processed",
            message: `Your payout of ZAR ${amountStr} has been processed and paid.`,
            data: { type: "payout_paid", payout_id: payoutData.id },
            url: "/provider/finance",
          },
          ["push"],
          { appType: "provider" }
        );
        await supabase.from("notifications").insert({
          user_id: providerUserId,
          type: "system",
          title: "Payout Processed",
          message: `Your payout of ZAR ${amountStr} has been processed and paid.`,
          data: { payout_id: payoutData.id, amount: payoutData.amount ?? payoutData.net_amount },
          action_url: "/provider/payouts",
        });
      }
    } catch (notifErr) {
      console.error("Transfer success: failed to notify provider:", notifErr);
    }

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

    try {
      const { data: provider } = await supabase
        .from("providers")
        .select("user_id")
        .eq("id", payoutData.provider_id)
        .single();
      const providerUserId = (provider as any)?.user_id;
      if (providerUserId) {
        const { sendToUser } = await import("@/lib/notifications/onesignal");
        const amountStr = (payoutData.amount ?? payoutData.net_amount ?? 0).toLocaleString();
        const reason = String(failureReason).slice(0, 200);
        await sendToUser(
          providerUserId,
          {
            title: "Payout Failed",
            message: `Your payout of ZAR ${amountStr} could not be processed. Reason: ${reason}`,
            data: { type: "payout_failed", payout_id: payoutData.id },
            url: "/provider/finance",
          },
          ["push"],
          { appType: "provider" }
        );
        await supabase.from("notifications").insert({
          user_id: providerUserId,
          type: "system",
          title: "Payout Failed",
          message: `Your payout of ZAR ${amountStr} could not be processed. Reason: ${reason}`,
          data: { payout_id: payoutData.id, amount: payoutData.amount ?? payoutData.net_amount, failure_reason: reason },
          action_url: "/provider/payouts",
        });
      }
    } catch (notifErr) {
      console.error("Transfer failed: failed to notify provider:", notifErr);
    }

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
