import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/whatsapp/delivery-log?limit=50
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 50), 200);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("whatsapp_delivery_log")
      .select(
        "message_sid, queue_row_id, recipient_user_id, template_key, content_sid, status, error_code, category, created_at, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return successResponse({ logs: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch WhatsApp delivery log");
  }
}
