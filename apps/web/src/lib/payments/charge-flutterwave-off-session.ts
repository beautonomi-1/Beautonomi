import { fromMinorUnits, toMinorUnits } from "@beautonomi/utils";
import {
  flutterwaveRequest,
  verifyFlutterwaveTransactionById,
} from "@/lib/payments/flutterwave-server";
import { settleFlutterwaveVerifiedTransaction } from "@/lib/payments/settle-flutterwave-online-payment";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function chargeFlutterwaveTokenized(params: {
  tenantId?: string | null;
  token: string;
  email: string;
  amountInSmallestUnit: number;
  currency: string;
  reference: string;
  metadata?: Record<string, unknown>;
}): Promise<
  | { ok: true; transactionId: string; status: string; raw: unknown }
  | { ok: false; message: string; raw?: unknown }
> {
  const token = params.token.trim();
  if (!token) return { ok: false, message: "Missing Flutterwave card token" };

  const currency = params.currency.trim().toUpperCase();
  const amountMajor = fromMinorUnits(params.amountInSmallestUnit, currency);

  try {
    const res = await flutterwaveRequest<{
      id?: number | string;
      status?: string;
      tx_ref?: string;
    }>(
      "POST",
      "/tokenized-charges",
      {
        token,
        email: params.email,
        amount: amountMajor,
        currency,
        tx_ref: params.reference,
        narration: "Beautonomi payment",
        meta: params.metadata ?? {},
      },
      params.tenantId,
    );
    const data = res.data ?? {};
    const status = String(data.status ?? "").toLowerCase();
    const transactionId = data.id != null ? String(data.id) : "";
    if (!transactionId) {
      return { ok: false, message: res.message || "Flutterwave did not return a transaction id", raw: data };
    }
    if (status !== "successful") {
      return {
        ok: false,
        message: `Flutterwave charge status: ${status || "unknown"}`,
        raw: data,
      };
    }
    return { ok: true, transactionId, status, raw: data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Flutterwave token charge failed";
    return { ok: false, message };
  }
}

/** Charge token, then settle through the shared online-payment pipeline. */
export async function chargeAndSettleFlutterwaveOffSession(
  supabase: SupabaseClient,
  params: {
    tenantId?: string | null;
    token: string;
    email: string;
    amountInSmallestUnit: number;
    currency: string;
    reference: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const charged = await chargeFlutterwaveTokenized(params);
  if (!charged.ok) return { ok: false, message: charged.message };

  const verified = await verifyFlutterwaveTransactionById(charged.transactionId, {
    tenantId: params.tenantId ?? null,
    expectedTxRef: params.reference,
    expectedAmountMinor: params.amountInSmallestUnit,
    currency: params.currency,
  });
  if (!verified.ok) {
    return { ok: false, message: verified.reason };
  }

  const settled = await settleFlutterwaveVerifiedTransaction(verified.tx, supabase, {
    tenantId: params.tenantId ?? null,
    expectedAmountMinor: params.amountInSmallestUnit,
  });
  if (!settled.settled) {
    return { ok: false, message: settled.reason ?? "Settlement failed after Flutterwave charge" };
  }
  return { ok: true };
}

export function flutterwaveTokenFromPaymentMethodId(id: string | null | undefined): string | null {
  const trimmed = (id ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("AUTH_") || trimmed.startsWith("pm_")) return null;
  return trimmed;
}

export function isFlutterwaveSavedCardToken(id: string | null | undefined): boolean {
  return Boolean(flutterwaveTokenFromPaymentMethodId(id));
}
