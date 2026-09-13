import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const url = new URL(request.url);
    const base = (url.searchParams.get("base") || "").trim().toUpperCase();
    const quote = (url.searchParams.get("quote") || "ZAR").trim().toUpperCase();

    if (base.length !== 3 || quote.length !== 3) {
      return errorResponse("base and quote required (ISO-4217)", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("fx_reference_rates")
      .select(
        "id, rate_date, base_currency, quote_currency, rate, source, hold_until, note, set_by, fetched_at",
      )
      .eq("base_currency", base)
      .eq("quote_currency", quote)
      .order("rate_date", { ascending: false })
      .limit(30);

    if (error) throw error;

    return successResponse({ rows: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to load FX history");
  }
}
