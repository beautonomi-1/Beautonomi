import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { z } from "zod";

const updateAddressSchema = z.object({
  label: z.string().min(1).optional(),
  address_line1: z.string().min(1).optional(),
  address_line2: z.string().optional().nullable(),
  city: z.string().min(1).optional(),
  state: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  country: z.string().min(1).optional(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  is_default: z.boolean().optional(),
  // House call specific fields
  apartment_unit: z.string().optional().nullable(),
  building_name: z.string().optional().nullable(),
  floor_number: z.string().optional().nullable(),
  access_codes: z.record(z.string(), z.string()).optional().nullable(),
  parking_instructions: z.string().optional().nullable(),
  location_landmarks: z.string().optional().nullable(),
});

/**
 * GET /api/me/addresses/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);

    const { id } = await params;
    const supabase = await getSupabaseServer();

    const { data: address, error } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !address) {
      return notFoundResponse("Address not found");
    }

    return successResponse(address);
  } catch (error) {
    return handleApiError(error, "Failed to fetch address");
  }
}

/**
 * PUT /api/me/addresses/[id]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);

    const { id } = await params;
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const validationResult = updateAddressSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }))
      );
    }

    // Check existing address
    const { data: existing } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!existing) {
      return notFoundResponse("Address not found");
    }

    let latitude = validationResult.data.latitude ?? (existing as any).latitude;
    let longitude = validationResult.data.longitude ?? (existing as any).longitude;

    // Re-geocode if address fields changed and coordinates not provided
    const addressChanged =
      validationResult.data.address_line1 ||
      validationResult.data.city ||
      validationResult.data.country;

    if (addressChanged && (!latitude || !longitude)) {
      try {
        const mapbox = await getMapboxService();
        const fullAddress = [
          validationResult.data.address_line1 || (existing as any).address_line1,
          validationResult.data.address_line2 || (existing as any).address_line2,
          validationResult.data.city || (existing as any).city,
          validationResult.data.state || (existing as any).state,
          validationResult.data.postal_code || (existing as any).postal_code,
          validationResult.data.country || (existing as any).country,
        ]
          .filter(Boolean)
          .join(", ");

        const geocodeResults = await mapbox.geocode(fullAddress, {
          country: validationResult.data.country || (existing as any).country,
          limit: 1,
        });

        if (geocodeResults.length > 0) {
          const result = geocodeResults[0];
          longitude = result.center[0];
          latitude = result.center[1];
        }
      } catch (error) {
        console.warn("Geocoding failed:", error);
      }
    }

    // If setting as default, unset other defaults
    if (validationResult.data.is_default) {
      await (supabase as any)
        .from("user_addresses")
        .update({ is_default: false })
        .eq("user_id", user.id)
        .neq("id", id);
    }

    // Prepare access_codes as JSONB if provided
    const updateData: any = {
      ...validationResult.data,
      latitude,
      longitude,
      updated_at: new Date().toISOString(),
    };
    
    if (validationResult.data.access_codes !== undefined) {
      updateData.access_codes = validationResult.data.access_codes
        ? JSON.stringify(validationResult.data.access_codes)
        : null;
    }

    const { data: address, error } = await (supabase
      .from("user_addresses") as any)
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error || !address) {
      throw error || new Error("Failed to update address");
    }

    return successResponse(address);
  } catch (error) {
    return handleApiError(error, "Failed to update address");
  }
}

/**
 * DELETE /api/me/addresses/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);

    const { id } = await params;
    const supabase = await getSupabaseServer();

    const { error } = await supabase
      .from("user_addresses")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    return successResponse({ id, deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete address");
  }
}
