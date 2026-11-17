import { NextRequest, NextResponse } from "next/server";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import {
  isMapboxNotConfiguredError,
  mapboxNotConfiguredResponse,
} from "@/lib/mapbox/mapbox-config-errors";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { checkMapboxRateLimit } from "@/lib/rate-limit/mapbox";
import { z } from "zod";

const reverseGeocodeSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
});

/**
 * POST /api/mapbox/reverse-geocode
 *
 * Body: { longitude, latitude }. Returns single Mapbox feature (place_name, center, text, context?)
 * for client alignment (e.g. customer app AddressPicker).
 */
export async function POST(request: NextRequest) {
  try {
    // F3-11: Mapbox is paid — require a signed-in user, then rate-limit.
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const rateLimitResponse = await checkMapboxRateLimit(request, user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const validationResult = reverseGeocodeSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    try {
      const mapbox = await getMapboxService();
      const result = await mapbox.reverseGeocode({
        longitude: validationResult.data.longitude,
        latitude: validationResult.data.latitude,
      });

      return NextResponse.json({
        data: result,
        error: null,
      });
    } catch (mapboxError: unknown) {
      if (isMapboxNotConfiguredError(mapboxError)) {
        console.warn("Mapbox not configured for reverse geocode");
        return NextResponse.json(mapboxNotConfiguredResponse(), { status: 503 });
      }
      throw mapboxError;
    }
  } catch (error: unknown) {
    const { handleApiError } = await import("@/lib/supabase/api-helpers");
    return handleApiError(error, "Failed to reverse geocode coordinates");
  }
}

