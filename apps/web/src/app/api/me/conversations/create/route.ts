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

    // When booking_id is provided: find or create that specific booking conversation
    if (booking_id) {
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("customer_id", user.id)
        .eq("provider_id", provider_id)
        .eq("booking_id", booking_id)
        .maybeSingle();

      if (existing) {
        return successResponse({ id: existing.id, created: false });
      }

      const { data: newConv, error: createError } = await (supabase.from("conversations") as any)
        .insert({
          booking_id,
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
    }

    // No booking_id: opening from provider profile. Prefer any existing conversation with this
    // provider (general or booking-specific) so the user sees their existing thread.
    const { data: existingList } = await supabase
      .from("conversations")
      .select("id")
      .eq("customer_id", user.id)
      .eq("provider_id", provider_id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1);

    const existing = existingList?.[0];
    if (existing) {
      return successResponse({ id: existing.id, created: false });
    }

    // Create new general conversation (no booking)
    const { data: newConv, error: createError } = await (supabase.from("conversations") as any)
      .insert({
        booking_id: null,
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
