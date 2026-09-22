import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, requireAdminSection, unauthorizedResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";

/**
 * GET /api/admin/city-waitlist
 * List expansion waitlist entries (service role; marketing section).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim() || undefined;
    const countryCode = searchParams.get("country_code")?.trim().toUpperCase() || undefined;
    const source = searchParams.get("source")?.trim() || undefined;
    const persona = searchParams.get("persona")?.trim() || undefined;
    const search = searchParams.get("search")?.trim() || undefined;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("page_size") ?? "25") || 25));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("city_waitlist")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status) query = query.eq("status", status);
    if (countryCode) query = query.eq("country_code", countryCode);
    if (source) query = query.eq("source", source);
    if (persona) query = query.eq("persona", persona);
    if (search) {
      const q = `%${search.replace(/%/g, "")}%`;
      query = query.or(
        `name.ilike.${q},email.ilike.${q},phone.ilike.${q},city_name.ilike.${q}`,
      );
    }

    const { data: rows, error, count } = await query;
    if (error) throw error;

    const { count: pendingCount } = await supabase
      .from("city_waitlist")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    return NextResponse.json({
      data: {
        items: rows ?? [],
        pagination: { page, page_size: pageSize, total: count ?? 0 },
        pending_count: pendingCount ?? 0,
      },
      error: null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load market waitlist");
  }
}
