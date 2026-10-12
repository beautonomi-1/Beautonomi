import type { SupabaseClient } from "@supabase/supabase-js";
import { toMinorUnits } from "@beautonomi/utils";
import { processSuccessfulPayment } from "@/app/api/payments/webhook/_handlers/charge-success";
import { processFailedPayment } from "@/app/api/payments/webhook/_handlers/charge-success";
import {
  verifyFlutterwaveTransactionById,
  type FlutterwaveVerifiedTransaction,
} from "@/lib/payments/flutterwave-server";
import { getOnlinePaymentCheckoutByReference } from "@/lib/payments/online-payment-checkouts";
import { markOnlinePaymentCheckoutStatus } from "@/lib/payments/online-payment-checkouts";

function mergeMetadata(
  checkoutMeta: Record<string, unknown>,
  flwMeta: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out = { ...checkoutMeta };
  if (flwMeta && typeof flwMeta === "object") {
    for (const [k, v] of Object.entries(flwMeta)) {
      if (out[k] == null) out[k] = v;
    }
  }
  return out;
}

function parseFlutterwaveCardExpiry(expiry?: string | null): {
  exp_month?: string;
  exp_year?: string;
} {
  const raw = (expiry ?? "").trim();
  if (!raw) return {};
  const parts = raw.split("/");
  if (parts.length !== 2) return {};
  const exp_month = parts[0]?.trim();
  let exp_year = parts[1]?.trim() ?? "";
  if (exp_year.length === 2) exp_year = `20${exp_year}`;
  if (!exp_month || !exp_year) return {};
  return { exp_month, exp_year };
}

function buildChargePayload(params: {
  reference: string;
  metadata: Record<string, unknown>;
  amountMinor: number;
  feeMinor: number;
  currency: string;
  customerEmail?: string | null;
  transactionId: string;
  cardToken?: string | null;
  card?: FlutterwaveVerifiedTransaction["card"];
}): Parameters<typeof processSuccessfulPayment>[0] {
  const metadata = {
    ...params.metadata,
    flutterwave_transaction_id: params.transactionId,
  };
  const customer = params.customerEmail ? { email: params.customerEmail } : undefined;
  const expiry = parseFlutterwaveCardExpiry(params.card?.expiry ?? null);
  const authorization =
    params.cardToken?.trim()
      ? {
          authorization_code: params.cardToken.trim(),
          reusable: true,
          last4: params.card?.last_4digits ?? undefined,
          brand: params.card?.type ?? undefined,
          card_type: params.card?.type ?? undefined,
          ...expiry,
        }
      : undefined;

  return {
    reference: params.reference,
    metadata,
    amount: params.amountMinor,
    fees: params.feeMinor,
    currency: params.currency,
    customer,
    authorization,
    __paymentProvider: "flutterwave",
  };
}

export async function settleFlutterwaveVerifiedTransaction(
  tx: FlutterwaveVerifiedTransaction,
  supabase: SupabaseClient,
  options?: { tenantId?: string | null; expectedAmountMinor?: number },
): Promise<{ settled: boolean; reason?: string }> {
  const reference = tx.tx_ref.trim();
  if (!reference) return { settled: false, reason: "missing_tx_ref" };

  const row = await getOnlinePaymentCheckoutByReference(reference);
  const tenantId = options?.tenantId ?? row?.tenant_id ?? null;
  const currency = tx.currency.toUpperCase();
  const amountMinor = toMinorUnits(tx.amount, currency);
  const feeMinor = toMinorUnits(Number(tx.app_fee ?? 0), currency);

  const metadata = mergeMetadata(row?.metadata ?? {}, tx.meta);

  await processSuccessfulPayment(
    buildChargePayload({
      reference,
      metadata,
      amountMinor,
      feeMinor,
      currency,
      customerEmail: tx.customer?.email ?? null,
      transactionId: tx.id,
      cardToken: tx.card?.token ?? null,
      card: tx.card,
    }),
    supabase,
    { paymentProvider: "flutterwave" },
  );
  await markOnlinePaymentCheckoutStatus(reference, "paid");
  return { settled: true };
}

export async function settleFlutterwaveChargeWebhookData(
  data: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<void> {
  const status = String(data.status ?? "").toLowerCase();
  const txRef = typeof data.tx_ref === "string" ? data.tx_ref.trim() : "";
  const transactionId =
    data.id != null ? String(data.id) : typeof data.transaction_id === "string" ? data.transaction_id : "";

  if (!transactionId) {
    console.warn("[settle-flutterwave] webhook missing transaction id");
    return;
  }

  const meta =
    data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
      ? (data.meta as Record<string, unknown>)
      : {};
  const tenantId =
    typeof meta.tenant_id === "string"
      ? meta.tenant_id
      : typeof meta.tenantId === "string"
        ? meta.tenantId
        : null;

  if (status !== "successful") {
    await processFailedPayment(
      {
        reference: txRef || transactionId,
        metadata: meta,
        __paymentProvider: "flutterwave",
        gateway_response: String(data.processor_response ?? data.status ?? "failed"),
      },
      supabase,
    );
    if (txRef) await markOnlinePaymentCheckoutStatus(txRef, "failed");
    return;
  }

  const verified = await verifyFlutterwaveTransactionById(transactionId, {
    tenantId,
    expectedTxRef: txRef || undefined,
  });
  if (!verified.ok) {
    console.warn("[settle-flutterwave] re-verify failed:", verified.reason);
    return;
  }
  await settleFlutterwaveVerifiedTransaction(verified.tx, supabase, { tenantId });
}

export async function settleFlutterwaveByTransactionId(
  transactionId: string,
  reference: string,
  supabase: SupabaseClient,
  tenantId?: string | null,
): Promise<{ paid: boolean }> {
  const row = await getOnlinePaymentCheckoutByReference(reference);
  const tid = tenantId ?? row?.tenant_id ?? null;
  const verified = await verifyFlutterwaveTransactionById(transactionId, {
    tenantId: tid,
    expectedTxRef: reference,
  });
  if (!verified.ok) return { paid: false };
  await settleFlutterwaveVerifiedTransaction(verified.tx, supabase, { tenantId: tid });
  return { paid: true };
}
