import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  badRequestResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updateZoneSelectionSchema = z.object({
  travel_fee: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  travel_time_minutes: z.number().int().positive().optional(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/provider/zone-selections/[id]
 * Get a specific zone selection
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    const { id } = await params;

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const { data: selection, error } = await supabase
      .from("provider_zone_selections")
      .select(`
        *,
        platform_zone:platform_zones(*)
      `)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !selection) {
      return notFoundResponse("Zone selection not found");
    }

    return successResponse(selection);
  } catch (error) {
    return handleApiError(error, "Failed to fetch zone selection");
  }
}

/**
 * PATCH /api/provider/zone-selections/[id]
 * Update a zone selection (pricing, etc.)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    const { id } = await params;

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    // Verify selection belongs to provider
    const { data: existing, error: fetchError } = await supabase
      .from("provider_zone_selections")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !existing) {
      return notFoundResponse("Zone selection not found");
    }

    const body = await request.json();
    const validationResult = updateZoneSelectionSchema.safeParse(body);

    if (!validationResult.success) {
      return badRequestResponse(
        validationResult.error.issues.map((i) => i.message).join(", ")
      );
    }

    const data = validationResult.data;
    const updateData: any = {};
    if (data.travel_fee !== undefined) updateData.travel_fee = data.travel_fee;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.travel_time_minutes !== undefined) updateData.travel_time_minutes = data.travel_time_minutes;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;

    const { data: selection, error } = await supabase
      .from("provider_zone_selections")
      .update(updateData)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select(`
        *,
        platform_zone:platform_zones(*)
      `)
      .single();

    if (error) {
      throw error;
    }

    return successResponse(selection);
  } catch (error) {
    return handleApiError(error, "Failed to update zone selection");
  }
}

/**
 * DELETE /api/provider/zone-selections/[id]
 * Remove a zone selection (opt out of zone)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    const { id } = await params;

    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const { error } = await supabase
      .from("provider_zone_selections")
      .delete()
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) {
      throw error;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to remove zone selection");
  }
}
