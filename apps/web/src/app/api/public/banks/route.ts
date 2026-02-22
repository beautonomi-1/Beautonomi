import { NextRequest } from "next/server";
import { successResponse } from "@/lib/supabase/api-helpers";
import { listBanks } from "@/lib/payments/paystack-complete";

/**
 * Map ISO country code to Paystack country parameter.
 * Paystack expects: ghana | kenya | nigeria | south africa
 */
const ISO_TO_PAYSTACK_COUNTRY: Record<string, string> = {
  ZA: "south africa",
  NG: "nigeria",
  GH: "ghana",
  KE: "kenya",
};

/**
 * Default currency by country (ISO code)
 */
const COUNTRY_CURRENCY: Record<string, string> = {
  ZA: "ZAR",
  NG: "NGN",
  GH: "GHS",
  KE: "KES",
};

/**
 * GET /api/public/banks
 *
 * Get list of banks. Uses Paystack's bank list API.
 * @param country - ISO code (ZA, NG, GH, KE) or Paystack format (south africa, nigeria, ghana, kenya)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const countryParam = (searchParams.get("country") || "ZA").trim();

    // Map ISO code to Paystack format if needed
    const paystackCountry =
      ISO_TO_PAYSTACK_COUNTRY[countryParam.toUpperCase()] ?? countryParam.toLowerCase();

    const response = await listBanks({ country: paystackCountry });

    if (!response.status) {
      throw new Error(response.message || "Failed to fetch banks");
    }

    const isoCountry =
      Object.entries(ISO_TO_PAYSTACK_COUNTRY).find(
        ([, v]) => v === paystackCountry
      )?.[0] ?? countryParam.toUpperCase();

    const defaultCurrency = COUNTRY_CURRENCY[isoCountry] ?? "ZAR";

    // Transform Paystack response to our format
    const banks = (response.data || []).map((bank: any) => ({
      code: bank.code,
      name: bank.name,
      country: isoCountry,
      currency: bank.currency || defaultCurrency,
      type: bank.type || "nuban",
    }));

    return successResponse(banks);
  } catch {
    // If Paystack fails, return fallback list for South Africa
    const isoCountry = "ZA";
    const currency = "ZAR";
    const saBanks = [
      { code: "632005", name: "Standard Bank", country: isoCountry, currency, type: "nuban" },
      { code: "632001", name: "First National Bank (FNB)", country: isoCountry, currency, type: "nuban" },
      { code: "632002", name: "Nedbank", country: isoCountry, currency, type: "nuban" },
      { code: "632003", name: "Absa Bank", country: isoCountry, currency, type: "nuban" },
      { code: "632004", name: "Capitec Bank", country: isoCountry, currency, type: "nuban" },
      { code: "632006", name: "Investec Bank", country: isoCountry, currency, type: "nuban" },
      { code: "632007", name: "African Bank", country: isoCountry, currency, type: "nuban" },
      { code: "632008", name: "Bidvest Bank", country: isoCountry, currency, type: "nuban" },
      { code: "632009", name: "Discovery Bank", country: isoCountry, currency, type: "nuban" },
      { code: "632010", name: "TymeBank", country: isoCountry, currency, type: "nuban" },
    ];
    return successResponse(saBanks);
  }
}
