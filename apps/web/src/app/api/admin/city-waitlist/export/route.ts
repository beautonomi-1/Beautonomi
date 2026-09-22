import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, requireAdminSection, unauthorizedResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * GET /api/admin/city-waitlist/export
 * CSV export for marketing ops (same filters as list).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim() || undefined;

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("city_waitlist")
      .select(
        "id,city_name,name,email,phone,country_code,country_name,source,persona,status,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(5000);

    if (status) query = query.eq("status", status);

    const { data: rows, error } = await query;
    if (error) throw error;

    const header =
      "id,city_name,name,email,phone,country_code,country_name,source,persona,status,created_at";
    const lines = (rows ?? []).map((r) =>
      [
        r.id,
        r.city_name,
        r.name,
        r.email ?? "",
        r.phone ?? "",
        r.country_code ?? "",
        r.country_name ?? "",
        r.source ?? "",
        r.persona ?? "",
        r.status,
        r.created_at,
      ]
        .map((c) => csvEscape(String(c)))
        .join(","),
    );

    const csv = [header, ...lines].join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="market-waitlist.csv"',
      },
    });
  } catch (error) {
    return handleApiError(error, "Export failed");
  }
}
