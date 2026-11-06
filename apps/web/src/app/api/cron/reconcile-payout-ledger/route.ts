/**
 * Finish Stripe Connect payouts whose transfer succeeded but the finance ledger
 * write did not. A Stripe transfer id is only stored after Stripe accepted the
 * transfer, so the money has moved; this never sends money again.
 *
 * Paystack and Flutterwave payouts also sit in `processing` with a transfer code
 * while the bank transfer is in flight. Their transfer webhooks complete them,
 * so they are not touched here.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { recordPayoutLedger } from "@/lib/provider/record-payout-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Leave room for the initiate-transfer request that is still writing the ledger. */
const MIN_AGE_MS = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ ok: false, error: auth.error ?? "unauthorized" }, { status: 401 });
  }

  return runLockedCronRoute("reconcile-payout-ledger", async () => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("payouts")
      .select("id, provider_id, amount, net_amount, payout_number, currency, transfer_code, payout_provider, status, updated_at")
      .eq("status", "processing")
      .eq("payout_provider", "stripe")
      .not("transfer_code", "is", null)
      .lt("updated_at", new Date(Date.now() - MIN_AGE_MS).toISOString())
      .limit(30);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    let completed = 0;
    let skipped = 0;
    for (const payout of data ?? []) {
      const { data: existing } = await admin
        .from("finance_transactions")
        .select("id, metadata")
        .eq("transaction_type", "payout")
        .eq("payout_id", payout.id)
        .limit(1)
        .maybeSingle();
      const reversed = Boolean(
        (existing as { metadata?: { reversed_at?: string } } | null)?.metadata?.reversed_at,
      );
      if (reversed) {
        skipped += 1;
        continue;
      }
      if (!existing) {
        try {
          await recordPayoutLedger(admin, {
            id: payout.id,
            provider_id: payout.provider_id,
            net_amount: Number(payout.net_amount ?? payout.amount ?? 0),
            amount: Number(payout.amount ?? 0),
            payout_number: payout.payout_number,
            currency: payout.currency || "ZAR",
            feeGateway: "stripe",
          });
        } catch (ledgerErr) {
          console.error("[reconcile-payout-ledger] ledger write failed", payout.id, ledgerErr);
          skipped += 1;
          continue;
        }
      }
      await admin
        .from("payouts")
        .update({
          status: "completed",
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payout.id)
        .eq("status", "processing");
      completed += 1;
    }
    return NextResponse.json({ ok: true, completed, skipped });
  });
}
