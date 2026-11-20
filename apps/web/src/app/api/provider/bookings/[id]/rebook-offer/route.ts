import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  cancelRebookOfferForBooking,
  confirmRebookOffer,
  previewRebookOffer,
} from "@/lib/bookings/rebook-offer-service";
import { rebookOfferWhatsAppHandoffAllowed } from "@/lib/bookings/rebook-offer-permissions";

const postSchema = z.object({
  message: z.string().max(2000).optional(),
  client_phone: z.string().max(32).optional(),
  deliver: z.enum(["channel", "self"]).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");
    const admin = getSupabaseAdmin();
    const preview = await previewRebookOffer(admin, id, providerId, user.id, request);
    if (!preview) return notFoundResponse("Booking not found");
  return successResponse(preview);
  } catch (error) {
    return handleApiError(error, "Failed to load rebook offer preview");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const { id } = await params;
    const body = postSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) {
      return errorResponse("Invalid body", "VALIDATION_ERROR", 400);
    }
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const admin = getSupabaseAdmin();
    const result = await confirmRebookOffer(
      admin,
      id,
      providerId,
      user.id,
      {
        messageOverride: body.data.message,
        clientPhone: body.data.client_phone,
        deliver: body.data.deliver ?? "channel",
      },
      request,
    );
    if (result.ok === false) {
      return errorResponse(result.message, result.code, result.code === "NO_CHANNEL" ? 409 : 400);
    }

    const canHandoff = await rebookOfferWhatsAppHandoffAllowed(user.id, providerId, request);
    return successResponse({
      offer_id: result.offerId,
      channel: result.channel,
      message_body: result.messageBody,
      link: result.link,
      whatsapp_url:
        result.channel === "whatsapp_handoff" && canHandoff ? result.whatsappUrl : null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to send rebook offer");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");
    await cancelRebookOfferForBooking(getSupabaseAdmin(), id, providerId);
    return successResponse({ cancelled: true });
  } catch (error) {
    return handleApiError(error, "Failed to cancel rebook offer");
  }
}