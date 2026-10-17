import { listBanks } from "@/lib/payments/paystack-complete";
import { listFlutterwaveBanks } from "@/lib/payments/flutterwave-banks";
import { resolvePayoutRailForTenant } from "@/lib/payments/payout-rail";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/** Paystack expects: south africa | nigeria | ghana | kenya */
export const ISO_TO_PAYSTACK_COUNTRY: Record<string, string> = {
  ZA: "south africa",
  NG: "nigeria",
  GH: "ghana",
  KE: "kenya",
};

export const COUNTRY_CURRENCY: Record<string, string> = {
  ZA: LAST_RESORT_CURRENCY,
  NG: "NGN",
  GH: "GHS",
  KE: "KES",
};

/** South Africa: request verification-capable banks only. */
export const BANK_VERIFICATION_FLAG_COUNTRIES = new Set(["ZA"]);

export type BankDirectoryEntry = {
  id?: number;
  code: string;
  name: string;
  slug?: string;
  country: string;
  currency: string;
  type: string;
};

export type BankDirectoryResult = {
  banks: BankDirectoryEntry[];
  country: string;
  currency: string;
  payout_rail?: "paystack" | "flutterwave" | "stripe";
  use_connect?: boolean;
};

export function resolveIsoCountry(countryParam: string, fallbackIso: string): string {
  const trimmed = countryParam.trim();
  if (trimmed.length === 2) {
    return trimmed.toUpperCase();
  }
  const fromPaystack = Object.keys(ISO_TO_PAYSTACK_COUNTRY).find(
    (k) => ISO_TO_PAYSTACK_COUNTRY[k] === trimmed.toLowerCase(),
  );
  return fromPaystack ?? fallbackIso;
}

export function paystackCountryFromIso(isoCountry: string, countryParam: string): string {
  return ISO_TO_PAYSTACK_COUNTRY[isoCountry] ?? countryParam.toLowerCase();
}

export function staticFallbackBanks(isoCountry: string, currency: string): BankDirectoryEntry[] {
  const fallbackType = isoCountry === "ZA" ? "basa" : "nuban";
  return [
    { code: "632005", name: "Standard Bank", country: isoCountry, currency, type: fallbackType },
    { code: "632001", name: "First National Bank (FNB)", country: isoCountry, currency, type: fallbackType },
    { code: "632002", name: "Nedbank", country: isoCountry, currency, type: fallbackType },
    { code: "632003", name: "Absa Bank", country: isoCountry, currency, type: fallbackType },
    { code: "632004", name: "Capitec Bank", country: isoCountry, currency, type: fallbackType },
    { code: "632006", name: "Investec Bank", country: isoCountry, currency, type: fallbackType },
    { code: "632007", name: "African Bank", country: isoCountry, currency, type: fallbackType },
    { code: "632008", name: "Bidvest Bank", country: isoCountry, currency, type: fallbackType },
    { code: "632009", name: "Discovery Bank", country: isoCountry, currency, type: fallbackType },
    { code: "632010", name: "TymeBank", country: isoCountry, currency, type: fallbackType },
  ];
}

export function normalizePaystackBankList(rawData: unknown): unknown[] {
  if (Array.isArray(rawData)) return rawData;
  if (rawData && typeof rawData === "object" && Array.isArray((rawData as { data?: unknown[] }).data)) {
    return (rawData as { data: unknown[] }).data;
  }
  return [];
}

export async function fetchBankDirectory(input: {
  tenantId: string;
  countryParam?: string;
  /** When true, return static list if Paystack/Flutterwave fails (public banks). */
  allowStaticFallback?: boolean;
}): Promise<BankDirectoryResult> {
  const tenantRegion = await getTenantRegionConfig(input.tenantId);
  const fallbackIso = tenantRegion?.regionCode || "ZA";
  const countryParam = (input.countryParam || fallbackIso).trim();
  const isoCountry = resolveIsoCountry(countryParam, fallbackIso);
  const paystackCountry = paystackCountryFromIso(isoCountry, countryParam);
  const currency =
    COUNTRY_CURRENCY[isoCountry] ?? tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

  const rail = await resolvePayoutRailForTenant(input.tenantId);
  if (rail === "stripe") {
    return {
      banks: [],
      payout_rail: "stripe",
      use_connect: true,
      country: isoCountry,
      currency,
    };
  }

  if (rail === "flutterwave") {
    const flwBanks = await listFlutterwaveBanks(isoCountry, input.tenantId);
    return {
      banks: flwBanks.map((b) => ({
        name: b.name,
        code: b.code,
        slug: b.code,
        country: isoCountry,
        currency,
        type: "flutterwave_bank",
      })),
      payout_rail: "flutterwave",
      country: isoCountry,
      currency,
    };
  }

  try {
    const result = await listBanks({
      country: paystackCountry,
      currency,
      perPage: 100,
      enabled_for_verification: BANK_VERIFICATION_FLAG_COUNTRIES.has(isoCountry),
      tenantId: input.tenantId,
    });

    if (!result.status) {
      throw new Error(result.message || "Failed to load banks");
    }

    const list = normalizePaystackBankList(result.data);
    const defaultType = isoCountry === "ZA" ? "basa" : "nuban";
    const banks = (list as Record<string, unknown>[]).map((b) => ({
      id: typeof b.id === "number" ? b.id : undefined,
      code: String(b.code ?? b.slug ?? b.id ?? ""),
      name: String(b.name ?? ""),
      slug: b.slug != null ? String(b.slug) : undefined,
      country: isoCountry,
      currency: String(b.currency ?? currency),
      type: String(b.type || defaultType),
    }));

    return { banks, country: isoCountry, currency, payout_rail: "paystack" };
  } catch (err) {
    if (!input.allowStaticFallback) {
      throw err;
    }
    return {
      banks: staticFallbackBanks(isoCountry, currency),
      country: isoCountry,
      currency,
      payout_rail: "paystack",
    };
  }
}
