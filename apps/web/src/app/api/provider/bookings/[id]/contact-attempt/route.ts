import { NextRequest } from "next/server";
import {
  errorResponse,
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/requirePermission";

const ALLOWED_CHANNELS = new Set(["call", "whatsapp", "sms", "message", "other"]);

/**
 * POST /api/provider/bookings/[id]/contact-attempt
 * Log a "Couldn't reach client" attempt (at-home close-out evidence).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = (await request.json().catch(() => ({}))) as {
      channel?: string;
      note?: string;
    };
    const channel = String(body.channel ?? "call").toLowerCase();
    if (!ALLOWED_CHANNELS.has(channel)) {
      return errorResponse("Invalid channel", "VALIDATION_ERROR", 400);
    }

    const { data: booking, error } = await supabase
      .from("bookings")
      .select("id, contact_attempts")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) throw error;
    if (!booking) return notFoundResponse("Booking not found");

    const existing = Array.isArray(booking.contact_attempts)
      ? (booking.contact_attempts as Array<Record<string, unknown>>)
      : [];
    const attempt = {
      at: new Date().toISOString(),
      channel,
      note: typeof body.note === "string" ? body.note.slice(0, 500) : undefined,
      by: user.id,
    };

    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        contact_attempts: [...existing, attempt],
        updated_at: attempt.at,
      })
      .eq("id", id)
      .eq("provider_id", providerId);

    if (updateError) throw updateError;

    return successResponse({
      booking_id: id,
      contact_attempts: [...existing, attempt],
    });
  } catch (error) {
    return handleApiError(error, "Failed to log contact attempt");
  }
}
