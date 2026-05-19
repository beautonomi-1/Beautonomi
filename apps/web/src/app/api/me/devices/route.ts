import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
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
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "provider_onboarding", "superadmin"],
      request
    );

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

    const supabase = await getSupabaseServer(request);
    const result = await registerDevice(supabase, user.id, player_id, platform, "customer");
    if (!result.success) {
      return errorResponse(
        result.error || "Failed to register device",
        "DEVICE_REGISTRATION_FAILED",
        500
      );
    }

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
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "provider_onboarding", "superadmin"],
      request
    );

    const supabase = await getSupabaseServer(request);

    const { data: devices, error } = await supabase
      .from("user_devices")
      .select("*")
      .eq("user_id", user.id)
      .eq("app_type", "customer");

    if (error) {
      throw error;
    }

    return successResponse(devices || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch devices");
  }
}

/**
 * DELETE /api/me/devices
 *
 * Unregister the current user's customer-app device by OneSignal subscription id.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "provider_onboarding", "superadmin"],
      request
    );
    const body = await request.json().catch(() => ({}));
    const playerId = typeof body?.player_id === "string" ? body.player_id.trim() : "";
    if (!playerId) {
      return errorResponse("player_id is required", "VALIDATION_ERROR", 400);
    }

    const supabase = await getSupabaseServer(request);
    const { error } = await supabase
      .from("user_devices")
      .delete()
      .eq("user_id", user.id)
      .eq("onesignal_player_id", playerId)
      .eq("app_type", "customer");
    if (error) throw error;

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete device");
  }
}
