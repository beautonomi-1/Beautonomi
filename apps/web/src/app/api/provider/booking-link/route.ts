import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

/**
 * GET /api/provider/booking-link
 * Returns the direct booking URL for the current provider (for link generator, embed, QR)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const providerIdParam = searchParams.get("provider_id");

    let providerId: string | null = null;
    if (user.role === "superadmin" && providerIdParam) {
      providerId = providerIdParam;
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
    }

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .select("id, slug, business_name, online_booking_enabled")
      .eq("id", providerId)
      .single();

    if (error || !provider) {
      return notFoundResponse("Provider not found");
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof request.url === "string" ? new URL(request.url).origin : null) ||
      "https://app.beautonomi.com";
    const bookingUrl = `${baseUrl}/book/${encodeURIComponent(provider.slug || provider.id)}`;

    return successResponse({
      id: provider.id,
      slug: provider.slug || provider.id,
      url: bookingUrl,
      embed_url: `${bookingUrl}?embed=1`,
      business_name: provider.business_name,
      is_active: provider.online_booking_enabled ?? true,
      online_booking_enabled: provider.online_booking_enabled ?? true,
    });
  } catch (error) {
    return handleApiError(error, "Failed to get booking link");
  }
}

const updateBookingLinkSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  is_active: z.boolean().optional(),
});

/**
 * PATCH /api/provider/booking-link
 * Update the provider's booking link slug or active status.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = await request.json();
    const validated = updateBookingLinkSchema.parse(body);

    const updateData: Record<string, unknown> = {};

    if (validated.slug !== undefined) {
      const { data: existing } = await supabase
        .from("providers")
        .select("id")
        .eq("slug", validated.slug)
        .neq("id", providerId)
        .maybeSingle();

      if (existing) {
        return handleApiError(
          new Error("Slug already taken"),
          "This URL slug is already in use. Please choose a different one.",
          "DUPLICATE_SLUG",
          400
        );
      }
      updateData.slug = validated.slug;
    }

    if (validated.is_active !== undefined) {
      updateData.online_booking_enabled = validated.is_active;
    }

    if (Object.keys(updateData).length === 0) {
      return handleApiError(new Error("No updates"), "No fields to update", "VALIDATION_ERROR", 400);
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .update(updateData)
      .eq("id", providerId)
      .select("id, slug, business_name, online_booking_enabled")
      .single();

    if (error) throw error;

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://app.beautonomi.com";
    const bookingUrl = `${baseUrl}/book/${encodeURIComponent(provider.slug || provider.id)}`;

    return successResponse({
      id: provider.id,
      slug: provider.slug || provider.id,
      url: bookingUrl,
      is_active: provider.online_booking_enabled ?? true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request data", 400);
    }
    return handleApiError(error, "Failed to update booking link");
  }
}
