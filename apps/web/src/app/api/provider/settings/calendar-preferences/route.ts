import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";

const DEFAULT_PREFS = {
  highContrast: false,
  showCanceled: true,
  timeIncrementMinutes: 15,
  workdayStartHour: 8,
  workdayEndHour: 20,
  showProcessingAndBuffer: true,
  defaultNewAppointmentStatus: "confirmed",
  processingFreesProvider: false,
  colorBy: "status",
  scrollToNow: true,
  showAppointmentIcons: true,
  compactMode: false,
  showPrices: false,
  showClientPhone: true,
};

/**
 * GET /api/provider/settings/calendar-preferences
 * Load calendar display preferences for the provider.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    let prefs = DEFAULT_PREFS;
    try {
      const { data: row } = await supabase
        .from("provider_settings")
        .select("calendar_preferences")
        .eq("provider_id", providerId)
        .maybeSingle();

      if (row?.calendar_preferences) {
        prefs = {
          ...DEFAULT_PREFS,
          ...(typeof row.calendar_preferences === "string"
            ? JSON.parse(row.calendar_preferences)
            : row.calendar_preferences),
        };
      }
    } catch {
      // Column may not exist yet; return defaults
    }

    return successResponse(prefs);
  } catch (error) {
    return handleApiError(error, "Failed to load calendar preferences");
  }
}

/**
 * PATCH /api/provider/settings/calendar-preferences
 * Update calendar display preferences.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = await request.json();

    try {
      const { error: upsertError } = await supabase
        .from("provider_settings")
        .upsert(
          {
            provider_id: providerId,
            calendar_preferences: body,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "provider_id" }
        );

      if (upsertError) throw upsertError;
    } catch (err: any) {
      if (err?.message?.includes("calendar_preferences")) {
        return successResponse({ ...DEFAULT_PREFS, ...body });
      }
      throw err;
    }

    return successResponse({ ...DEFAULT_PREFS, ...body });
  } catch (error) {
    return handleApiError(error, "Failed to save calendar preferences");
  }
}
