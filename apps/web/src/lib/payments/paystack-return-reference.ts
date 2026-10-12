/** Paystack / Flutterwave append `reference`, `trxref`, or `tx_ref` on redirect back to our callback URL. */
export function paystackReferenceFromSearchParams(
  params: Pick<URLSearchParams, "get">,
): string | null {
  const reference = params.get("reference")?.trim();
  if (reference) return reference;
  const trxref = params.get("trxref")?.trim();
  if (trxref) return trxref;
  const txRef = params.get("tx_ref")?.trim();
  return txRef || null;
}
