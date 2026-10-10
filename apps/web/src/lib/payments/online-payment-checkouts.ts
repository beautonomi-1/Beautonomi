import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type OnlineCheckoutProvider = "paystack" | "stripe";

export type OnlineCheckoutRow = {
  reference: string;
  provider: OnlineCheckoutProvider;
  tenant_id: string | null;
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  status: "pending" | "paid" | "failed" | "expired";
  metadata: Record<string, unknown>;
};

export async function upsertOnlinePaymentCheckout(row: {
  reference: string;
  provider: OnlineCheckoutProvider;
  tenantId?: string | null;
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  status?: OnlineCheckoutRow["status"];
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  await (supabase.from("online_payment_checkouts") as any).upsert(
    {
      reference: row.reference,
      provider: row.provider,
      tenant_id: row.tenantId ?? null,
      checkout_session_id: row.checkoutSessionId ?? null,
      payment_intent_id: row.paymentIntentId ?? null,
      status: row.status ?? "pending",
      metadata: row.metadata ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "reference" },
  );
}

export async function getOnlinePaymentCheckoutByReference(
  reference: string,
): Promise<OnlineCheckoutRow | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("online_payment_checkouts")
    .select(
      "reference, provider, tenant_id, checkout_session_id, payment_intent_id, status, metadata",
    )
    .eq("reference", reference)
    .maybeSingle();
  if (!data) return null;
  const d = data as OnlineCheckoutRow;
  return {
    ...d,
    metadata:
      d.metadata && typeof d.metadata === "object" && !Array.isArray(d.metadata)
        ? (d.metadata as Record<string, unknown>)
        : {},
  };
}

export async function markOnlinePaymentCheckoutStatus(
  reference: string,
  status: OnlineCheckoutRow["status"],
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await (supabase.from("online_payment_checkouts") as any)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("reference", reference);
}
