import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { z } from "zod";

const addressSchema = z.object({
  label: z.string().min(1, "Label is required"),
  address_line1: z.string().min(1, "Address is required"),
  address_line2: z.string().optional().nullable(),
  city: z.string().min(1, "City is required"),
  state: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  country: z.string().min(1, "Country is required"),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  is_default: z.boolean().default(false),
  // House call specific fields
  apartment_unit: z.string().optional().nullable(),
  building_name: z.string().optional().nullable(),
  floor_number: z.string().optional().nullable(),
  access_codes: z.record(z.string(), z.string()).optional().nullable(), // {gate: "1234", buzzer: "Apt 5", door: "4567"}
  parking_instructions: z.string().optional().nullable(),
  location_landmarks: z.string().optional().nullable(),
});

/**
 * GET /api/me/addresses
 * 
 * Get user's saved addresses
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer();

    const { data: addresses, error } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse(addresses || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch addresses");
  }
}

/**
 * POST /api/me/addresses
 * 
 * Create a new saved address (with Mapbox geocoding)
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer();
    const body = await request.json();

    const validationResult = addressSchema.safeParse(body);
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

    let latitude = validationResult.data.latitude;
    let longitude = validationResult.data.longitude;

    // Geocode address if coordinates not provided
    if (!latitude || !longitude) {
      try {
        const mapbox = await getMapboxService();
        const fullAddress = [
          validationResult.data.address_line1,
          validationResult.data.address_line2,
          validationResult.data.city,
          validationResult.data.state,
          validationResult.data.postal_code,
          validationResult.data.country,
        ]
          .filter(Boolean)
          .join(", ");

        const geocodeResults = await mapbox.geocode(fullAddress, {
          country: validationResult.data.country,
          limit: 1,
        });

        if (geocodeResults.length > 0) {
          const result = geocodeResults[0];
          longitude = result.center[0];
          latitude = result.center[1];
        }
      } catch (error) {
        console.warn("Geocoding failed, continuing without coordinates:", error);
        // Continue without coordinates - they can be added later
      }
    }

    // If setting as default, unset other defaults
    if (validationResult.data.is_default) {
      await (supabase as any)
        .from("user_addresses")
        .update({ is_default: false })
        .eq("user_id", user.id);
    }

    // Prepare access_codes as JSONB
    const accessCodesJson = validationResult.data.access_codes 
      ? JSON.stringify(validationResult.data.access_codes)
      : null;

    const { data: address, error } = await (supabase
      .from("user_addresses") as any)
      .insert({
        user_id: user.id,
        ...validationResult.data,
        access_codes: accessCodesJson,
        latitude,
        longitude,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !address) {
      throw error || new Error("Failed to create address");
    }

    return successResponse(address);
  } catch (error) {
    return handleApiError(error, "Failed to create address");
  }
}
