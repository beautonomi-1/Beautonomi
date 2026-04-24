import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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

    // §Provider-launch (audit 2026-04): the previous implementation queried
    // `public.users` with the provider's JWT. RLS on `users` only allows
    // `SELECT` where `auth.uid() = id`, so every lookup for a *customer*
    // UUID returned zero rows — the API always responded "Customer not
    // found" even for real registered clients. Use the service role to read
    // the customer row, then enforce that this provider is actually
    // allowed to message them (client list or shared booking).
    const admin = getSupabaseAdmin();
    const { data: customer, error: customerError } = await admin
      .from("users")
      .select("id, email")
      .eq("id", customer_id)
      .maybeSingle();

    if (customerError || !customer) {
      // §Provider-audit 2026-04: surface a specific code so the mobile app
      // can show a dedicated "walk-in client" hint instead of the generic
      // "Cannot message" alert.
      return handleApiError(
        new Error("Customer not found"),
        "This client isn't on Beautonomi yet. Invite them to sign up before sending a chat message.",
        "CUSTOMER_UNREGISTERED",
        404
      );
    }

    if (customer.email?.includes("beautonomi.invalid") || customer.email?.includes("beautonomi.local")) {
      return handleApiError(
        new Error("Customer is not registered"),
        "This client isn't on Beautonomi yet. Invite them to sign up before sending a chat message.",
        "CUSTOMER_UNREGISTERED",
        400
      );
    }

    let providerMayMessage = false;
    if (booking_id) {
      const { data: bookingRow } = await admin
        .from("bookings")
        .select("id")
        .eq("id", booking_id)
        .eq("provider_id", providerId)
        .eq("customer_id", customer_id)
        .maybeSingle();
      providerMayMessage = Boolean(bookingRow);
    }
    if (!providerMayMessage) {
      const { data: clientRow } = await admin
        .from("provider_clients")
        .select("id")
        .eq("provider_id", providerId)
        .eq("customer_id", customer_id)
        .maybeSingle();
      if (clientRow) {
        providerMayMessage = true;
      } else {
        const { data: anyBooking } = await admin
          .from("bookings")
          .select("id")
          .eq("provider_id", providerId)
          .eq("customer_id", customer_id)
          .limit(1)
          .maybeSingle();
        providerMayMessage = Boolean(anyBooking);
      }
    }

    if (!providerMayMessage) {
      return handleApiError(
        new Error("Customer not linked to provider"),
        "You can only message customers who appear in your client list or have booked with you.",
        "CUSTOMER_NOT_LINKED",
        403
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

    // §Provider-launch (audit 2026-04): insert via service role so
    // `provider_staff` rows can start threads. RLS on `conversations`
    // INSERT only allowed `providers.user_id = auth.uid()` (owner), which
    // silently blocked every staff-initiated chat even after the customer
    // lookup above was fixed.
    const { data: newConv, error: createError } = await admin
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
