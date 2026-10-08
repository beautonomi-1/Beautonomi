/** Stripe Checkout / PaymentIntent metadata: string values only. */
export function stringifyStripeMetadata(
  input: Record<string, unknown> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    const k = key.slice(0, 40).replace(/[\[\]]/g, "");
    if (!k) continue;
    let s: string;
    if (typeof value === "string") s = value;
    else if (typeof value === "number" || typeof value === "boolean") s = String(value);
    else s = JSON.stringify(value);
    out[k] = s.slice(0, 500);
  }
  return out;
}
