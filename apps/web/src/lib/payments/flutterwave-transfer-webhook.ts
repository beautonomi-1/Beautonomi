import type { SupabaseClient } from "@supabase/supabase-js";

function normalizeTransferStatus(raw: unknown): "completed" | "failed" | "processing" {
  const status = String(raw ?? "").toLowerCase();
  if (["successful", "success", "completed"].includes(status)) return "completed";
  if (["failed", "failure", "cancelled", "canceled"].includes(status)) return "failed";
  return "processing";
}

function payoutIdFromReference(reference: string | null | undefined): string | null {
  const ref = (reference ?? "").trim();
  const m = /^payout_([0-9a-f-]{36})$/i.exec(ref);
  return m ? m[1] : null;
}

type PayoutRow = {
  id: string;
  status: string;
  provider_id: string;
  net_amount?: number | null;
  amount?: number | null;
  payout_number?: string | null;
  currency?: string | null;
  transfer_code?: string | null;
};

function transferFeeMajorFromFlutterwaveData(
  data: Record<string, unknown>,
  currency: string,
): number | undefined {
  const raw = data.fee ?? data.fees ?? data.charge_fee;
  if (raw == null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  // Flutterwave transfer payloads typically use major units; subunit values are unlikely at payout scale.
  void currency;
  return n;
}

/**
 * Flutterwave `transfer.completed` (and related) — finalize admin payout rows.
 * Writes finance ledger before marking completed (same money-safe ordering as Paystack transfer webhooks).
 */
export async function handleFlutterwaveTransferWebhook(
  data: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<{ handled: boolean; payoutId?: string; reason?: string }> {
  const reference =
    (typeof data.reference === "string" && data.reference.trim()) ||
    (typeof data.tx_ref === "string" && data.tx_ref.trim()) ||
    null;
  const payoutId = payoutIdFromReference(reference);
  if (!payoutId) {
    return { handled: false, reason: "not_payout_reference" };
  }

  const transferId =
    data.id != null
      ? String(data.id)
      : typeof data.transfer_id === "string"
        ? data.transfer_id
        : null;
  const status = normalizeTransferStatus(data.status);
  const now = new Date().toISOString();

  const { data: payoutRow, error: payoutErr } = await supabase
    .from("payouts")
    .select("id, status, provider_id, net_amount, amount, payout_number, currency, transfer_code")
    .eq("id", payoutId)
    .maybeSingle();

  if (payoutErr) throw payoutErr;
  if (!payoutRow) {
    return { handled: false, reason: "payout_not_found" };
  }

  const payout = payoutRow as PayoutRow;

  if (status === "completed" && payout.status === "completed") {
    return { handled: true, payoutId };
  }

  if (status === "completed") {
    const currency =
      typeof payout.currency === "string" && payout.currency.trim()
        ? payout.currency.trim()
        : "ZAR";
    const transferFeeMajor = transferFeeMajorFromFlutterwaveData(data, currency);

    const { recordPayoutLedger } = await import("@/lib/provider/record-payout-ledger");
    await recordPayoutLedger(supabase, {
      id: payout.id,
      provider_id: payout.provider_id,
      net_amount: payout.net_amount ?? payout.amount ?? 0,
      amount: payout.amount ?? payout.net_amount ?? 0,
      payout_number: payout.payout_number ?? undefined,
      currency: payout.currency,
      transferFeeMajor,
      feeGateway: "flutterwave",
    });
  }

  const update: Record<string, unknown> = {
    updated_at: now,
    payout_provider_response: data,
    payout_provider: "flutterwave",
  };
  if (transferId) update.transfer_code = transferId;

  if (status === "completed") {
    update.status = "completed";
    update.paid_at = now;
  } else if (status === "failed") {
    update.status = "failed";
    update.payout_provider = null;
  }

  const { error: updateErr } = await supabase.from("payouts").update(update).eq("id", payoutId);
  if (updateErr) throw updateErr;

  return { handled: true, payoutId };
}
