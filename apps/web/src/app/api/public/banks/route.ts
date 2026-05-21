import { NextRequest, NextResponse } from "next/server";
import { successResponse } from "@/lib/supabase/api-helpers";
import { listBanks } from "@/lib/payments/paystack-complete";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

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
  ZA: LAST_RESORT_CURRENCY,
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
  let tenantId: string;
  try {
    tenantId = await resolveTenantIdWithZaFallback(request);
  } catch (tenantErr) {
    console.error("Tenant resolution failed in /api/public/banks:", tenantErr);
    return NextResponse.json(
      {
        data: null,
        error: { message: "Tenant not configured", code: "TENANT_UNAVAILABLE" },
      },
      { status: 503 }
    );
  }
  const tenantRegion = await getTenantRegionConfig(tenantId);
  const fallbackIso = tenantRegion?.regionCode || "ZA";
  const fallbackCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

  try {
    const { searchParams } = new URL(request.url);
    const countryParam = (searchParams.get("country") || fallbackIso).trim();

    // Map ISO code to Paystack format if needed
    const paystackCountry =
      ISO_TO_PAYSTACK_COUNTRY[countryParam.toUpperCase()] ?? countryParam.toLowerCase();

    // §payout-account-fix 2026-05: South Africa banks only resolve through
    // Paystack when `enabled_for_verification=true` is set; otherwise the list
    // includes display-only banks the recipient API will reject.
    const isoForFlag =
      Object.entries(ISO_TO_PAYSTACK_COUNTRY).find(([, v]) => v === paystackCountry)?.[0] ??
      countryParam.toUpperCase();
    const response = await listBanks({
      country: paystackCountry,
      perPage: 100,
      enabled_for_verification: isoForFlag === "ZA",
      tenantId,
    });

    if (!response.status) {
      throw new Error(response.message || "Failed to fetch banks");
    }

    const isoCountry =
      Object.entries(ISO_TO_PAYSTACK_COUNTRY).find(
        ([, v]) => v === paystackCountry
      )?.[0] ?? countryParam.toUpperCase();

    const defaultCurrency =
      COUNTRY_CURRENCY[isoCountry] ?? tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // Transform Paystack response to our format. ZA defaults to `basa` when
    // Paystack omits the type (older list responses), matching what the
    // transfer-recipient API expects for South Africa.
    const defaultType = isoCountry === "ZA" ? "basa" : "nuban";
    const banks = (response.data || []).map((bank: any) => ({
      code: bank.code,
      name: bank.name,
      country: isoCountry,
      currency: bank.currency || defaultCurrency,
      type: bank.type || defaultType,
    }));

    return successResponse(banks);
  } catch {
    // If Paystack fails, return a static fallback list for the tenant's region (defaults ZA).
    // For ZA, Paystack expects the `basa` recipient type — not `nuban` — so we surface
    // that here too even though the codes are universal across countries.
    const isoCountry = fallbackIso;
    const currency = fallbackCurrency;
    const fallbackType = isoCountry === "ZA" ? "basa" : "nuban";
    const saBanks = [
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
    return successResponse(saBanks);
  }
}
