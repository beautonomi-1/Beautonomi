import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { buildBrandCalendar } from "@/lib/brand-marketing/calendar";

export async function GET(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const now = new Date();
    const window = {
      from: from ? new Date(from) : new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 4, 0),
    };

    const supabase = getSupabaseAdmin();
    const payload = await buildBrandCalendar(supabase, access.tenantId, window);
    return successResponse(payload);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to load calendar");
  }
}
