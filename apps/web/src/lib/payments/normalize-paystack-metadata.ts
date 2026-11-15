import { extractBookingIdFromPaystackPayloadData } from "@/lib/payment/resolve-payment-webhook-tenant";

/**
 * Paystack verify/webhook sometimes returns `metadata` as a JSON string, or only
 * inside `custom_fields`, instead of the object we sent at initialize.
 */
export function normalizePaystackMetadata(raw: unknown): Record<string, unknown> {
  let value = raw;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const meta = { ...(value as Record<string, unknown>) };
  const bookingId = extractBookingIdFromPaystackPayloadData({ metadata: meta });
  if (bookingId && typeof meta.booking_id !== "string") {
    meta.booking_id = bookingId;
  }
  return meta;
}

/**
 * Paystack's verify response sometimes drops the custom fields we sent.
 * The checkout row saved at initialize still has them. Gateway values win
 * when they are present; stored values fill the gaps.
 */
export function mergeStoredCheckoutMetadata(
  gatewayMetadata: Record<string, unknown>,
  storedMetadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!storedMetadata) return gatewayMetadata;
  const merged: Record<string, unknown> = { ...storedMetadata };
  for (const [key, value] of Object.entries(gatewayMetadata)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    merged[key] = value;
  }
  return merged;
}
