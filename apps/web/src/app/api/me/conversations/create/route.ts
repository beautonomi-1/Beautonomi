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
    const supabase = await getSupabaseServer();

    const body = createSchema.parse(await request.json());
    const { provider_id, booking_id } = body;

    // Check if conversation already exists
    // For conversations without booking_id, we should find any conversation with this provider
    // For conversations with booking_id, we should find the specific booking conversation
    let query = supabase
      .from("conversations")
      .select("id")
      .eq("customer_id", user.id)
      .eq("provider_id", provider_id);
    
    // Properly handle NULL booking_id comparison
    if (booking_id) {
      query = query.eq("booking_id", booking_id);
    } else {
      // For non-booking conversations, check for NULL booking_id
      query = query.is("booking_id", null);
    }
    
    const { data: existing } = await query.maybeSingle();

    if (existing) {
      return successResponse({ id: existing.id, created: false });
    }

    // Create new conversation
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
