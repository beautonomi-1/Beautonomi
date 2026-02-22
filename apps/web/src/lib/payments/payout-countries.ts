/**
 * Paystack-supported countries for bank transfers.
 * https://paystack.com/docs/api/miscellaneous/#list-banks
 */
export const PAYOUT_COUNTRIES = [
  { code: "ZA", name: "South Africa", currency: "ZAR", paystackParam: "south africa" },
  { code: "NG", name: "Nigeria", currency: "NGN", paystackParam: "nigeria" },
  { code: "GH", name: "Ghana", currency: "GHS", paystackParam: "ghana" },
  { code: "KE", name: "Kenya", currency: "KES", paystackParam: "kenya" },
] as const;

export type PayoutCountryCode = (typeof PAYOUT_COUNTRIES)[number]["code"];

export function getCurrencyForCountry(code: string): string {
  return PAYOUT_COUNTRIES.find((c) => c.code === code)?.currency ?? "ZAR";
}
