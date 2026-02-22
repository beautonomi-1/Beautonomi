import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { registerDevice } from "@/lib/notifications/onesignal";
import { z } from "zod";

const deviceSchema = z.object({
  player_id: z.string().min(1, "Player ID is required"),
  platform: z.enum(["web", "ios", "android"]),
});

/**
 * POST /api/me/devices
 * 
 * Register a device for push notifications (customer)
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);

    const body = await request.json();
    const validationResult = deviceSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues.map((issue) => ({ path: issue.path, message: issue.message }))
      );
    }

    const { player_id, platform } = validationResult.data;

    await registerDevice(user.id, player_id, platform);

    return successResponse({ registered: true });
  } catch (error) {
    return handleApiError(error, "Failed to register device");
  }
}

/**
 * GET /api/me/devices
 * 
 * Get user's registered devices
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);

    const { getSupabaseServer } = await import("@/lib/supabase/server");
    const supabase = await getSupabaseServer(request);

    const { data: devices, error } = await supabase
      .from("user_devices")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    return successResponse(devices || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch devices");
  }
}
