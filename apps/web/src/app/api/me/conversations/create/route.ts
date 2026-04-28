import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const createSchema = z.object({
  provider_id: z.string().uuid("Invalid provider ID"),
  booking_id: z.string().uuid().optional().nullable(),
});

/**
 * POST /api/me/conversations/create
 * 
 * Create a new conversation with a provider
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    const body = createSchema.parse(await request.json());
    const { provider_id, booking_id } = body;

    // One thread per provider (matches POST /api/provider/conversations and migration
    // conversations_customer_provider_uidx). Whether the client came from a booking
    // flow or the profile, reuse the same row so the provider app does not list the
    // same client multiple times.
    const { data: existingList } = await supabase
      .from("conversations")
      .select("id, booking_id")
      .eq("customer_id", user.id)
      .eq("provider_id", provider_id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1);

    const existing = existingList?.[0];
    if (existing) {
      if (booking_id && existing.booking_id == null) {
        await (supabase.from("conversations") as any)
          .update({ booking_id })
          .eq("id", existing.id);
      }
      return successResponse({ id: existing.id, created: false });
    }

    // First conversation with this provider
    const { data: newConv, error: createError } = await (supabase.from("conversations") as any)
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
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues.map((e: any) => e.message).join(", "), "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to create conversation");
  }
}
