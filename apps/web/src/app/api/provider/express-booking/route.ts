import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { checkExpressBookingFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";

const createExpressLinkSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  service_ids: z.array(z.string().uuid()).optional().default([]),
  staff_ids: z.array(z.string().uuid()).optional().default([]),
  expires_at: z.string().datetime().optional().nullable(),
  max_uses: z.number().int().positive().optional(),
  is_active: z.boolean().optional().default(true),
});

/**
 * GET /api/provider/express-booking
 * 
 * List provider's express booking links
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
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

    const { data: links, error } = await supabase
      .from("express_booking_links")
      .select("*")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse(links || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch express booking links");
  }
}

/**
 * POST /api/provider/express-booking
 * 
 * Create a new express booking link
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
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

    // Check link limit
    if (expressAccess.maxLinks) {
      const { data: existingLinks } = await supabase
        .from("express_booking_links")
        .select("id")
        .eq("provider_id", providerId)
        .eq("is_active", true);

      if ((existingLinks?.length || 0) >= expressAccess.maxLinks) {
        return errorResponse(
          `You've reached your express booking link limit (${expressAccess.maxLinks}). Please upgrade your plan to create more links.`,
          "LIMIT_REACHED",
          403
        );
      }
    }

    const body = await request.json();
    const validated = createExpressLinkSchema.parse(body);

    // Check if slug already exists for this provider
    const { data: existingLink } = await supabase
      .from("express_booking_links")
      .select("id")
      .eq("provider_id", providerId)
      .eq("slug", validated.slug)
      .maybeSingle();

    if (existingLink) {
      return errorResponse(
        "A booking link with this slug already exists. Please choose a different slug.",
        "DUPLICATE_SLUG",
        400
      );
    }

    const { data: link, error } = await supabase
      .from("express_booking_links")
      .insert({
        provider_id: providerId,
        ...validated,
        use_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(link);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request data", 400);
    }
    return handleApiError(error, "Failed to create express booking link");
  }
}
