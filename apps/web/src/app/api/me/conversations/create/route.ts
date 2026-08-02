import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";
import { requireSocialAccess } from "@/lib/safety/require-social-access";
import { assertNotBlocked, UserBlockedError } from "@/lib/safety/user-blocks";

const createSchema = z.object({
  provider_id: z.string().uuid("Invalid provider ID"),
  booking_id: z.string().uuid().optional().nullable(),
});

/**
 * POST /api/me/conversations/create
 *
 * Create a new conversation with a provider (customer-facing; also used when a
 * signed-in user opens chat from booking/profile).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    if (user.role === "customer") {
      await requireSocialAccess(user.id, "direct_message", request);
    }
    const body = createSchema.parse(await request.json());
    const { provider_id, booking_id } = body;

    const admin = getSupabaseAdmin();

    const { data: prov, error: provErr } = await admin.from("providers").select("id, user_id").eq("id", provider_id).maybeSingle();
    if (provErr) throw provErr;
    if (!prov) {
      return notFoundResponse("Provider not found");
    }

    const providerOwnerId = (prov as { user_id?: string | null }).user_id;
    if (providerOwnerId) {
      await assertNotBlocked(user.id, providerOwnerId, admin);
    }

    if (booking_id && user.role !== "superadmin") {
      const { data: bk, error: bkErr } = await admin
        .from("bookings")
        .select("id, customer_id, provider_id")
        .eq("id", booking_id)
        .maybeSingle();
      if (bkErr) throw bkErr;
      if (!bk || bk.provider_id !== provider_id || bk.customer_id !== user.id) {
        return errorResponse(
          "That booking does not belong to you or this provider.",
          "INVALID_BOOKING",
          400,
        );
      }
    }

    const { data: existingList, error: existingErr } = await admin
      .from("conversations")
      .select("id, booking_id")
      .eq("customer_id", user.id)
      .eq("provider_id", provider_id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (existingErr) throw existingErr;

    const existing = existingList?.[0];
    if (existing) {
      if (booking_id && existing.booking_id == null) {
        const { error: upErr } = await admin.from("conversations").update({ booking_id }).eq("id", existing.id);
        if (upErr) throw upErr;
      }
      return successResponse({ id: existing.id, created: false });
    }

    const { data: newConv, error: createError } = await admin
      .from("conversations")
      .insert({
        booking_id: booking_id || null,
        customer_id: user.id,
        provider_id: provider_id,
        last_message_at: new Date().toISOString(),
        last_message_preview: "",
        last_message_sender_id: user.id,
        unread_count_customer: 0,
        unread_count_provider: 0,
      })
      .select("id")
      .single();

    if (createError) throw createError;

    return successResponse({ id: newConv.id, created: true });
  } catch (error) {
    if (error instanceof UserBlockedError || (error as { code?: string })?.code === "USER_BLOCKED") {
      return errorResponse(
        error instanceof Error ? error.message : "You cannot interact with this user.",
        "USER_BLOCKED",
        403,
      );
    }
    if (error instanceof z.ZodError) {
      return errorResponse(
        error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        400,
      );
    }
    return handleApiError(error, "Failed to create conversation");
  }
}
