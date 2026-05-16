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
 * POST /api/provider/devices
 *
 * Register a device for push notifications (provider)
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "provider_onboarding", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);

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

    const result = await registerDevice(supabase, user.id, player_id, platform, "provider");
    if (!result.success) {
      return errorResponse(
        result.error || "Failed to register device",
        "DEVICE_REGISTRATION_FAILED",
        500,
      );
    }

    return successResponse({ registered: true });
  } catch (error) {
    return handleApiError(error, "Failed to register device");
  }
}
