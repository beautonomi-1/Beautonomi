import { NextRequest } from "next/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveReportingRate } from "@/lib/fx/resolve-reporting-rate";
import { normalizeCurrencyCode } from "@beautonomi/utils";

/**
 * GET /api/public/fx/indicative?from=USD&to=ZAR
 * Indicative display conversion only — charge currency at checkout is unchanged.
 */
export async function GET(request: NextRequest) {
  try {
    const from = normalizeCurrencyCode(request.nextUrl.searchParams.get("from") || "ZAR");
    const to = normalizeCurrencyCode(request.nextUrl.searchParams.get("to") || "ZAR");

    if (from === to) {
      return successResponse({
        from,
        to,
        rate: 1,
        source: "identity",
        indicative: true,
        label: "≈",
      });
    }

    const resolved = await resolveReportingRate({ base: from, quote: to });
    if (resolved.rate == null) {
      return successResponse({
        from,
        to,
        rate: null,
        source: resolved.source,
        indicative: true,
        ready: false,
      });
    }

    return successResponse({
      from,
      to,
      rate: resolved.rate,
      rateDate: resolved.rateDate,
      source: resolved.source,
      indicative: true,
      ready: true,
      label: "≈",
    });
  } catch (error) {
    return handleApiError(error, "Failed to resolve indicative FX rate");
  }
}
