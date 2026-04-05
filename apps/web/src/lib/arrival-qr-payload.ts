/**
 * Detects JSON payloads encoded in customer arrival QR codes (matches server QRCodeData shape).
 */
export function isArrivalQrPayloadString(data: string): boolean {
  const t = data.trim();
  if (!t.startsWith("{")) return false;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    return (
      o.type === "arrival_verification" &&
      typeof o.booking_id === "string" &&
      typeof o.verification_code === "string" &&
      typeof o.expires_at === "string"
    );
  } catch {
    return false;
  }
}
