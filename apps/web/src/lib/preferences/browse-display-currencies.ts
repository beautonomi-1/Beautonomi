/** Common browse-only display currencies (charge currency stays tenant default). */
export const BROWSE_DISPLAY_CURRENCY_CODES = [
  "ZAR",
  "USD",
  "EUR",
  "GBP",
  "AUD",
  "CAD",
  "AED",
  "NGN",
  "KES",
  "GHS",
  "BRL",
  "INR",
  "CHF",
  "NZD",
  "SGD",
] as const;

/** Tenant default first, then configured codes, then the browse set. */
export function mergeBrowseDisplayCurrencyCodes(
  tenantCodes: readonly string[],
  defaultCode: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code || seen.has(code)) return;
    seen.add(code);
    out.push(code);
  };
  add(defaultCode);
  for (const code of tenantCodes) add(code);
  for (const code of BROWSE_DISPLAY_CURRENCY_CODES) add(code);
  return out;
}
