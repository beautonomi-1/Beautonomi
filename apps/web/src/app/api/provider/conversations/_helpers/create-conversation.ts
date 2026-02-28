import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const createSchema = z.object({
  customer_id: z.string().uuid("Invalid customer ID"),
  booking_id: z.string().uuid().optional().nullable(),
});

/**
 * Shared logic for POST create conversation.
 * Used by both /api/provider/conversations/create and /api/provider/conversations/[id] when id=create.
 */
export async function createConversation(request: NextRequest): Promise<Response> {
  try {
    const permissionCheck = await requirePermission("send_messages", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider account required", 403);
    }

    const body = createSchema.parse(await request.json());
    const { customer_id, booking_id } = body;

    const { data: customer, error: customerError } = await supabase
      .from("users")
      .select("id, email")
      .eq("id", customer_id)
      .single();

    if (customerError || !customer) {
      return handleApiError(new Error("Customer not found"), "Customer not found", 404);
    }

    if (customer.email?.includes("beautonomi.invalid") || customer.email?.includes("beautonomi.local")) {
      return handleApiError(
        new Error("Customer is not registered"),
        "This customer is not registered on Beautonomi. Only registered customers can receive chat messages.",
        400
      );
    }

    let query = supabase
      .from("conversations")
      .select("id")
      .eq("customer_id", customer_id)
      .eq("provider_id", providerId);

    if (booking_id) {
      query = query.eq("booking_id", booking_id);
    } else {
      query = query.is("booking_id", null);
    }

    const { data: existing } = await query.maybeSingle();

    if (existing) {
      return successResponse({ id: existing.id, created: false });
    }

    const { data: newConv, error: createError } = await supabase
      .from("conversations")
      .insert({
        booking_id: booking_id || null,
        customer_id: customer_id,
        provider_id: providerId,
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
      return handleApiError(
        error,
        error.issues.map((e: any) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to create conversation");
  }
}
