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
import { formatCurrency } from "@/lib/utils";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { writeAuditLog } from "@/lib/audit/audit";

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

  const isTransferSuccess = eventType === "transfer.success";
  const isTransferFailure = eventType === "transfer.failed" || eventType === "transfer.reversed";

  // Idempotency: matching terminal events are no-ops, but contradictory
  // Paystack outcomes must still reconcile the local payout/ledger state.
  if (
    (payoutData.status === "completed" && isTransferSuccess) ||
    (payoutData.status === "failed" && isTransferFailure)
  ) {
    return NextResponse.json({ received: true });
  }

  if (isTransferSuccess) {
    // Write the payout ledger BEFORE marking the payout completed.
    // If the ledger write fails, the payout stays in processing so
    // getAvailablePayoutBalance won't under-count the reserve.
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
      console.error("Transfer success: failed to record payout ledger, leaving payout in processing:", ledgerErr);
      // Throw so the outer webhook router marks the event failed and Paystack retries it.
      throw ledgerErr;
    }

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
    const { error: updateError } = await (supabase.from("payouts") as any)
      .update(updatePayload)
      .eq("id", payoutData.id);
    if (updateError) {
      throw updateError;
    }

    await writeAuditLog({
      actor_user_id: null,
      actor_role: "system",
      action: "webhook.payout.transfer_success",
      entity_type: "payout",
      entity_id: payoutData.id,
      module: "finance",
      risk_level: "high",
      retention_tier: "financial",
      metadata: {
        provider_id: payoutData.provider_id,
        amount: payoutData.amount ?? payoutData.net_amount,
        transfer_code: transferCode || payoutData.transfer_code,
        event: eventType,
      },
    });

    try {
      const { data: provider } = await supabase
        .from("providers")
        .select("user_id")
        .eq("id", payoutData.provider_id)
        .single();
      const providerUserId = (provider as any)?.user_id;
      if (providerUserId) {
        const { sendToUser } = await import("@/lib/notifications/onesignal");
        const raw = Number(payoutData.amount ?? payoutData.net_amount ?? 0);
        const payoutCurrency =
          typeof payoutData.currency === "string" && payoutData.currency.trim()
            ? payoutData.currency.trim()
            : LAST_RESORT_CURRENCY;
        const amountFormatted = formatCurrency(raw, payoutCurrency);
        await sendToUser(
          providerUserId,
          {
            title: "Payout Processed",
            message: `Your payout of ${amountFormatted} has been processed and paid.`,
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
          message: `Your payout of ${amountFormatted} has been processed and paid.`,
          data: { payout_id: payoutData.id, amount: payoutData.amount ?? payoutData.net_amount },
          action_url: "/provider/payouts",
        });
      }
    } catch (notifErr) {
      console.error("Transfer success: failed to notify provider:", notifErr);
    }

    return NextResponse.json({ received: true });
  }

  if (isTransferFailure) {
    const failureReason =
      data?.reason || data?.message || data?.gateway_response || eventType;
    if (payoutData.status === "completed") {
      // Payout was already completed then reversed — post a reversing GL entry
      // instead of deleting the finance_transactions row (which would orphan
      // the original journal entry and cause GL drift).
      try {
        const { data: ftRows } = await (supabase.from("finance_transactions") as any)
          .select("id")
          .eq("payout_id", payoutData.id)
          .eq("transaction_type", "payout");
        for (const ft of ftRows ?? []) {
          await supabase.rpc("revert_journal_for_finance_tx" as any, { p_finance_tx_id: ft.id });
        }
      } catch (glErr) {
        console.error("[transfer-events] revert_journal_for_finance_tx failed:", glErr);
        // Fall back to delete to avoid the status being stuck (best-effort reversal)
      }
      const { error: ledgerDeleteError } = await (supabase.from("finance_transactions") as any)
        .delete()
        .eq("payout_id", payoutData.id)
        .eq("transaction_type", "payout");
      if (ledgerDeleteError) {
        throw ledgerDeleteError;
      }
    }
    // Paystack charges the R3 transfer fee even on failed/reversed transfers.
    // Record it as a standalone expense so the platform's cost is visible.
    try {
      const { recordFailedPayoutTransferFee } = await import("@/lib/provider/record-payout-ledger");
      await recordFailedPayoutTransferFee(supabase, {
        id: payoutData.id,
        provider_id: payoutData.provider_id,
        amount: payoutData.amount ?? payoutData.net_amount,
        payout_number: payoutData.payout_number,
      });
    } catch (feeErr) {
      // Best-effort: a fee-record failure must not block the payout status update
      console.error("[transfer-events] recordFailedPayoutTransferFee error:", feeErr);
    }
    const { error: updateError } = await (supabase.from("payouts") as any)
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
    if (updateError) {
      throw updateError;
    }

    await writeAuditLog({
      actor_user_id: null,
      actor_role: "system",
      action: `webhook.payout.${eventType === "transfer.reversed" ? "transfer_reversed" : "transfer_failed"}`,
      entity_type: "payout",
      entity_id: payoutData.id,
      module: "finance",
      risk_level: "high",
      retention_tier: "financial",
      metadata: {
        provider_id: payoutData.provider_id,
        amount: payoutData.amount ?? payoutData.net_amount,
        transfer_code: transferCode || payoutData.transfer_code,
        failure_reason: String(failureReason).slice(0, 500),
        event: eventType,
        prior_status: payoutData.status,
      },
    });

    try {
      const { data: provider } = await supabase
        .from("providers")
        .select("user_id")
        .eq("id", payoutData.provider_id)
        .single();
      const providerUserId = (provider as any)?.user_id;
      if (providerUserId) {
        const { sendToUser } = await import("@/lib/notifications/onesignal");
        const raw = Number(payoutData.amount ?? payoutData.net_amount ?? 0);
        const payoutCurrency =
          typeof payoutData.currency === "string" && payoutData.currency.trim()
            ? payoutData.currency.trim()
            : LAST_RESORT_CURRENCY;
        const amountFormatted = formatCurrency(raw, payoutCurrency);
        const reason = String(failureReason).slice(0, 200);
        await sendToUser(
          providerUserId,
          {
            title: "Payout Failed",
            message: `Your payout of ${amountFormatted} could not be processed. Reason: ${reason}`,
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
          message: `Your payout of ${amountFormatted} could not be processed. Reason: ${reason}`,
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
  const { error: updateError } = await (supabase.from("payouts") as any)
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
  if (updateError) {
    throw updateError;
  }

  return NextResponse.json({ received: true });
}
