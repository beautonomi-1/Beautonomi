import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, notFoundResponse, handleApiError, errorResponse, successResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { resendNotification } from "@/lib/notifications/appointment-notifications";
import type { NotificationType } from "@/lib/notifications/appointment-notifications";

/**
 * POST /api/provider/bookings/[id]/notify-resend
 * Resend a notification to customer (server-side only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const providerId = await getProviderIdForUser(permissionCheck.user.id);
    if (!providerId) return notFoundResponse("Provider not found");

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();
    const type = body.type as NotificationType;

    if (!["confirmation", "reminder"].includes(type)) {
      return errorResponse("type must be confirmation or reminder", "VALIDATION_ERROR", 400);
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("provider_id, scheduled_at")
      .eq("id", id)
      .single();
    if (!booking || (booking as any).provider_id !== providerId) {
      return notFoundResponse("Booking not found");
    }

    const context = type === "reminder"
      ? { hoursUntil: 24 }
      : undefined;

    const result = await resendNotification(id, type, context);

    return successResponse({ success: result.success, sent: result.sent, error: result.error });
  } catch (error) {
    return handleApiError(error, "Failed to resend notification");
  }
}
