import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PaymentFraudSubjects = {
  tenantId: string | null;
  subjectUserId: string | null;
  subjectProviderId: string | null;
  bookingId: string | null;
};

/**
 * Resolve tenant and subject users/providers from a payment transaction reference.
 */
export async function resolvePaymentFraudSubjects(
  reference: string,
  paymentProvider: string,
  supabase: SupabaseClient = getSupabaseAdmin(),
): Promise<PaymentFraudSubjects> {
  const { data: txn } = await supabase
    .from("payment_transactions")
    .select("booking_id, metadata, provider")
    .eq("reference", reference)
    .eq("provider", paymentProvider)
    .maybeSingle();

  const meta = ((txn as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<
    string,
    unknown
  >;
  const bookingId = (txn as { booking_id?: string | null } | null)?.booking_id ?? null;

  let tenantId: string | null =
    typeof meta.tenant_id === "string" ? meta.tenant_id : null;
  let subjectUserId: string | null =
    typeof meta.user_id === "string" ? meta.user_id : null;
  let subjectProviderId: string | null =
    typeof meta.provider_id === "string" ? meta.provider_id : null;

  if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("tenant_id, customer_id, provider_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (booking) {
      tenantId = tenantId ?? (booking as { tenant_id?: string }).tenant_id ?? null;
      subjectUserId =
        subjectUserId ?? (booking as { customer_id?: string }).customer_id ?? null;
      subjectProviderId =
        subjectProviderId ?? (booking as { provider_id?: string }).provider_id ?? null;
    }
  }

  if (subjectProviderId && !tenantId) {
    const { data: provider } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", subjectProviderId)
      .maybeSingle();
    tenantId = (provider as { tenant_id?: string | null } | null)?.tenant_id ?? null;
  }

  return { tenantId, subjectUserId, subjectProviderId, bookingId };
}
