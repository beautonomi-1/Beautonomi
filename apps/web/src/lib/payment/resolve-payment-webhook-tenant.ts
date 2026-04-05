import type { SupabaseClient } from "@supabase/supabase-js";

function stringBookingIdOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Reads booking id from Paystack `metadata`: flat `booking_id`, nested
 * `custom_fields.booking_id`, or `custom_fields` array entries (`variable_name` / `value`).
 */
function extractBookingIdFromMetadata(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const direct = stringBookingIdOrNull(m.booking_id);
  if (direct) return direct;
  const cf = m.custom_fields;
  if (cf && typeof cf === "object" && !Array.isArray(cf)) {
    const nested = stringBookingIdOrNull((cf as Record<string, unknown>).booking_id);
    if (nested) return nested;
  }
  if (Array.isArray(cf)) {
    for (const item of cf) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (row.variable_name === "booking_id" && typeof row.value === "string" && row.value.trim()) {
        return row.value.trim();
      }
    }
  }
  return null;
}

/**
 * Reads `data.metadata` booking id from Paystack webhook `data` when present.
 */
export function extractBookingIdFromPaystackPayloadData(data: unknown): string | null {
  const meta = (data as { metadata?: unknown } | null)?.metadata;
  return extractBookingIdFromMetadata(meta);
}

/**
 * Resolves which tenant_id should scope `payment_webhook_events` for a Paystack callback.
 * Order: Host-mapped tenant → booking.tenant_id (from metadata.booking_id) → default (e.g. ZA).
 */
export async function resolvePaymentWebhookTenantId(
  supabase: SupabaseClient,
  params: {
    hostTenantId: string | null | undefined;
    bookingIdFromPayload: string | null | undefined;
    defaultTenantId: string | null | undefined;
  },
): Promise<string | null> {
  const host = typeof params.hostTenantId === "string" && params.hostTenantId.trim()
    ? params.hostTenantId.trim()
    : null;
  if (host) return host;

  const bid =
    typeof params.bookingIdFromPayload === "string" && params.bookingIdFromPayload.trim()
      ? params.bookingIdFromPayload.trim()
      : null;
  if (bid) {
    const { data } = await supabase
      .from("bookings")
      .select("tenant_id")
      .eq("id", bid)
      .maybeSingle();
    const tid = (data as { tenant_id?: string | null } | null)?.tenant_id;
    if (typeof tid === "string" && tid.trim()) return tid.trim();
  }

  const fallback =
    typeof params.defaultTenantId === "string" && params.defaultTenantId.trim()
      ? params.defaultTenantId.trim()
      : null;
  return fallback;
}
