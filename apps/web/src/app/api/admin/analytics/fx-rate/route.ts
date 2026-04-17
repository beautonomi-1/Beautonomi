/**
 * GET /api/admin/analytics/fx-rate
 *
 * P7 (audit 2026-04): closes the "`getFxRate` has zero importers / FX
 * infrastructure is dead code" finding by giving the FX rate table (migration
 * 494) a real, audited consumer. Admin-only endpoint that exposes the latest
 * effective rate between two currencies at an optional point in time.
 *
 * Query params:
 *   - base (required, ISO 4217, case insensitive)
 *   - quote (required, ISO 4217, case insensitive)
 *   - at (optional ISO timestamp; defaults to `now()`)
 *
 * Response:
 *   { base, quote, at, rate: number | null, source: 'fx_rates_table' | 'identity' }
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getFxRate } from "@/lib/fx/get-fx-rate";

const ISO_4217 = /^[A-Za-z]{3}$/;

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
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

    const normBase = base.toUpperCase();
    const normQuote = quote.toUpperCase();

    const rate = await getFxRate({ base: normBase, quote: normQuote, at });

    return successResponse({
      base: normBase,
      quote: normQuote,
      at: (at ?? new Date()).toISOString(),
      rate,
      source: normBase === normQuote ? "identity" : "fx_rates_table",
    });
  } catch (error) {
    return handleApiError(error, "Failed to resolve FX rate");
  }
}
