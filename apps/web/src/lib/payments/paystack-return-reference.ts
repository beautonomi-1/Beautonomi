/** Paystack appends `reference` or `trxref` on redirect back to our callback URL. */
export function paystackReferenceFromSearchParams(
  params: Pick<URLSearchParams, "get">,
): string | null {
  const reference = params.get("reference")?.trim();
  if (reference) return reference;
  const trxref = params.get("trxref")?.trim();
  return trxref || null;
}
