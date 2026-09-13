import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveReportingRate } from "@/lib/fx/resolve-reporting-rate";

const ISO_4217 = /^[A-Za-z]{3}$/;

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin", "admin_finance"], request);
    const url = new URL(request.url);
    const base = (url.searchParams.get("base") || "").trim();
    const quote = (url.searchParams.get("quote") || "").trim();
    const atRaw = (url.searchParams.get("at") || "").trim();

    if (!ISO_4217.test(base) || !ISO_4217.test(quote)) {
      return handleApiError(
        new Error("base and quote must be ISO-4217 codes"),
        "base and quote must be ISO-4217 codes",
        "VALIDATION_ERROR",
        400,
      );
    }

    let at: Date | undefined;
    if (atRaw) {
      const parsed = new Date(atRaw);
      if (Number.isNaN(parsed.getTime())) {
        return handleApiError(
          new Error("`at` must be an ISO timestamp"),
          "`at` must be an ISO timestamp",
          "VALIDATION_ERROR",
          400,
        );
      }
      at = parsed;
    }

    const resolved = await resolveReportingRate({
      base: base.toUpperCase(),
      quote: quote.toUpperCase(),
      at,
    });

    return successResponse({
      base: resolved.base,
      quote: resolved.quote,
      at: resolved.at,
      rate: resolved.rate,
      source: resolved.source,
      rate_date: resolved.rateDate ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to resolve FX rate");
  }
}
