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

// ─── Two-phase payout ledger reversal ────────────────────────────────────────

export type ReverseCompletedPayoutLedgerResult = {
  /** finance_transactions payout rows found for the payout. */
  rows: number;
  /** Rows whose journal was reverted (or verified already reverted) and marked this call. */
  reversed: number;
  /** Rows that were already marked reversed by an earlier webhook (idempotent replay). */
  alreadyReversed: number;
};

/**
 * Phase 1: post a reversing journal entry for every `payout` finance row of the
 * payout (revert_journal_for_finance_tx) and VERIFY the reversal exists.
 * Phase 2: mark the finance row `metadata.reversed_at` (never DELETE — the audit
 * trail and the original journal entry must survive).
 *
 * Throws when the revert cannot be verified so the caller leaves the payout in
 * `completed` and the webhook is retried / escalated to ops. Idempotent: rows
 * already marked `reversed_at` are skipped, and an existing reversal entry is
 * reused instead of posting a second one.
 */
export async function reverseCompletedPayoutLedger(
  supabase: SupabaseClient,
  params: { payoutId: string; reason: string; event: string },
): Promise<ReverseCompletedPayoutLedgerResult> {
  const nowIso = new Date().toISOString();
  const { data: ftRows, error: ftError } = await (supabase.from("finance_transactions") as any)
    .select("id, metadata")
    .eq("payout_id", params.payoutId)
    .eq("transaction_type", "payout");
  if (ftError) throw ftError;

  const rows = (ftRows ?? []) as Array<{ id: string; metadata?: Record<string, unknown> | null }>;
  let reversed = 0;
  let alreadyReversed = 0;

  for (const ft of rows) {
    const existingReversedAt = ft.metadata?.reversed_at;
    if (typeof existingReversedAt === "string" && existingReversedAt.length > 0) {
      alreadyReversed += 1;
      continue;
    }

    // Phase 1a: is there already a reversal entry (retry after a crash between
    // the RPC and the metadata update)? Never post a second reversal.
    const { data: priorReversal, error: priorErr } = await (supabase.from("journal_entries") as any)
      .select("id")
      .eq("source", "finance_transactions_reversal")
      .eq("external_ref", ft.id)
      .limit(1);
    if (priorErr) throw priorErr;

    if (!(priorReversal ?? []).length) {
      const { error: rpcError } = await supabase.rpc("revert_journal_for_finance_tx" as any, {
        p_finance_tx_id: ft.id,
      });
      if (rpcError) {
        throw new Error(
          `[transfer-events] revert_journal_for_finance_tx failed for finance_tx ${ft.id} (payout ${params.payoutId}): ${rpcError.message ?? String(rpcError)}`,
        );
      }
    }

    // Phase 1b: verify. If the original shadow entry exists, a reversal MUST now exist.
    const { data: originalEntries, error: origErr } = await (supabase.from("journal_entries") as any)
      .select("id")
      .eq("source", "finance_transactions")
      .eq("external_ref", ft.id)
      .limit(1);
    if (origErr) throw origErr;

    if ((originalEntries ?? []).length > 0) {
      const { data: reversalEntries, error: revErr } = await (supabase.from("journal_entries") as any)
        .select("id")
        .eq("source", "finance_transactions_reversal")
        .eq("external_ref", ft.id)
        .limit(1);
      if (revErr) throw revErr;
      if (!(reversalEntries ?? []).length) {
        throw new Error(
          `[transfer-events] payout journal revert NOT verified for finance_tx ${ft.id} (payout ${params.payoutId}); payout left as completed for ops review`,
        );
      }
    } else {
      console.warn(
        `[transfer-events] no shadow journal entry for payout finance_tx ${ft.id}; marking reversed without GL revert`,
      );
    }

    // Phase 2: mark (do not delete) the finance row.
    const { error: markError } = await (supabase.from("finance_transactions") as any)
      .update({
        metadata: {
          ...(ft.metadata ?? {}),
          reversed_at: nowIso,
          reversed_reason: String(params.reason).slice(0, 500),
          reversed_event: params.event,
        },
      })
      .eq("id", ft.id);
    if (markError) throw markError;
    reversed += 1;
  }

  return { rows: rows.length, reversed, alreadyReversed };
}

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
        currency: typeof payoutData.currency === "string" ? payoutData.currency : null,
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
      // Payout was already completed then reversed — two-phase: revert the GL
      // journal and VERIFY it, then mark the finance row reversed (never delete;
      // deleting orphans the original journal entry and causes GL drift). If the
      // revert cannot be verified we throw: the payout stays `completed`, the
      // webhook is retried, and ops is alerted via the audit log.
      try {
        await reverseCompletedPayoutLedger(supabase, {
          payoutId: payoutData.id,
          reason: String(failureReason),
          event: eventType,
        });
      } catch (glErr) {
        console.error(
          "[transfer-events] payout ledger reversal failed; payout status NOT changed:",
          glErr,
        );
        try {
          await writeAuditLog({
            actor_user_id: null,
            actor_role: "system",
            action: "webhook.payout.reversal_gl_failed",
            entity_type: "payout",
            entity_id: payoutData.id,
            module: "finance",
            risk_level: "critical",
            retention_tier: "financial",
            metadata: {
              provider_id: payoutData.provider_id,
              amount: payoutData.amount ?? payoutData.net_amount,
              transfer_code: transferCode || payoutData.transfer_code,
              event: eventType,
              error: glErr instanceof Error ? glErr.message : String(glErr),
            },
          });
        } catch (auditErr) {
          console.error("[transfer-events] audit log for reversal failure failed:", auditErr);
        }
        throw glErr;
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
        currency: typeof payoutData.currency === "string" ? payoutData.currency : null,
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
