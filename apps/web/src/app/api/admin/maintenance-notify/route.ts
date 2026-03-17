import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";

/**
 * GET /api/admin/maintenance-notify?scope=...&limit=...
 * Returns maintenance sign-up emails (superadmin only). Optional scope filter.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const { searchParams } = request.nextUrl;
    const scope = searchParams.get("scope");
    const limit = Math.min(Number(searchParams.get("limit")) || 500, 2000);

    const supabase = getSupabaseAdmin();
    let q = supabase
      .from("maintenance_notify_emails")
      .select("id, email, scope, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (scope && ["public_site", "provider_web", "customer_app", "provider_app"].includes(scope)) {
      q = q.eq("scope", scope);
    }

    const { data, error } = await q;

    if (error) throw error;
    return successResponse(data ?? [], 200);
  } catch (e) {
    return handleApiError(e, "Failed to load maintenance sign-ups");
  }
}
