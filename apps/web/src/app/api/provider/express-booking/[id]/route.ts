import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { checkExpressBookingFeatureAccess } from "@/lib/subscriptions/feature-access";
import { SUBSCRIPTION_UPGRADE_SHORT } from "@/lib/subscriptions/subscription-upgrade-copy";
import { sanitizeExpressPrefill } from "@/lib/express-booking/prefill";
import { z } from "zod";

const updateExpressLinkSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  service_ids: z.array(z.string().uuid()).optional(),
  staff_ids: z.array(z.string().uuid()).optional(),
  location_id: z.string().uuid().optional().nullable(),
  location_type: z.enum(["at_salon", "at_home"]).optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
  max_uses: z.number().int().positive().optional().nullable(),
  is_active: z.boolean().optional(),
  prefill: z.unknown().optional(),
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
        SUBSCRIPTION_UPGRADE_SHORT,
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    // Verify link belongs to provider
    const { data: link, error: fetchError } = await supabase
      .from("express_booking_links")
      .select("id, provider_id, slug, is_active")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !link) {
      return notFoundResponse("Express booking link not found");
    }

    const body = await request.json();
    let validated = updateExpressLinkSchema.parse(body);
    const prefillUpdate =
      body && typeof body === "object" && "prefill" in body
        ? sanitizeExpressPrefill((body as { prefill?: unknown }).prefill)
        : undefined;
    if (validated.location_type === "at_home") {
      validated = { ...validated, location_id: null };
    }
    if (validated.location_id != null && validated.location_type !== "at_salon") {
      validated = { ...validated, location_type: "at_salon" as const };
    }
    if (validated.location_id) {
      const { data: loc } = await supabase
        .from("provider_locations")
        .select("id")
        .eq("id", validated.location_id)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (!loc) {
        return errorResponse("Selected location not found or does not belong to your business.", "INVALID_LOCATION", 400);
      }
    }

    const effectiveSlug = validated.slug ?? link.slug;
    const effectiveIsActive = validated.is_active ?? link.is_active ?? true;

    // Public URLs only contain the short code, so active codes must resolve to one link.
    if (effectiveIsActive && effectiveSlug) {
      const { data: existingLinks } = await getSupabaseAdmin()
        .from("express_booking_links")
        .select("id")
        .eq("slug", effectiveSlug)
        .eq("is_active", true)
        .neq("id", id)
        .limit(1);

      if (existingLinks?.length) {
        return errorResponse(
          "A booking link with this short code already exists. Please choose a different code.",
          "DUPLICATE_SLUG",
          400
        );
      }
    }

    const { prefill: _p, ...validatedRest } = validated;
    const { data: updated, error } = await supabase
      .from("express_booking_links")
      .update({
        ...validatedRest,
        ...(prefillUpdate !== undefined ? { prefill: prefillUpdate } : {}),
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
