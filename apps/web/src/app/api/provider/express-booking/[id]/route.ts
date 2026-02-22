import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { checkExpressBookingFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";

const updateExpressLinkSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  service_ids: z.array(z.string().uuid()).optional(),
  staff_ids: z.array(z.string().uuid()).optional(),
  expires_at: z.string().datetime().optional().nullable(),
  max_uses: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
});

/**
 * PATCH /api/provider/express-booking/[id]
 * 
 * Update an express booking link
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    const { id } = await params;
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Check subscription allows express booking
    const expressAccess = await checkExpressBookingFeatureAccess(providerId);
    if (!expressAccess.enabled) {
      return errorResponse(
        "Express booking links require a subscription upgrade. Please upgrade to Starter plan or higher.",
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    // Verify link belongs to provider
    const { data: link, error: fetchError } = await supabase
      .from("express_booking_links")
      .select("id, provider_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !link) {
      return notFoundResponse("Express booking link not found");
    }

    const body = await request.json();
    const validated = updateExpressLinkSchema.parse(body);

    // If slug is being updated, check for duplicates
    if (validated.slug) {
      const { data: existingLink } = await supabase
        .from("express_booking_links")
        .select("id")
        .eq("provider_id", providerId)
        .eq("slug", validated.slug)
        .neq("id", id)
        .maybeSingle();

      if (existingLink) {
        return errorResponse(
          "A booking link with this slug already exists. Please choose a different slug.",
          "DUPLICATE_SLUG",
          400
        );
      }
    }

    const { data: updated, error } = await supabase
      .from("express_booking_links")
      .update({
        ...validated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request data", 400);
    }
    return handleApiError(error, "Failed to update express booking link");
  }
}

/**
 * DELETE /api/provider/express-booking/[id]
 * 
 * Delete an express booking link
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    const { id } = await params;
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify link belongs to provider
    const { data: link, error: fetchError } = await supabase
      .from("express_booking_links")
      .select("id, provider_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !link) {
      return notFoundResponse("Express booking link not found");
    }

    const { error } = await supabase
      .from("express_booking_links")
      .delete()
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) {
      throw error;
    }

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete express booking link");
  }
}
