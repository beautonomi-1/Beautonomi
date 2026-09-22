import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/whatsapp/customer-messages?limit=50
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 50), 200);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("whatsapp_customer_messages")
      .select(
        "id, direction, phone, user_id, booking_id, twilio_sid, body, button_id, template_key, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return successResponse({ messages: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch WhatsApp customer messages");
  }
}
