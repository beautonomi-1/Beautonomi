import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { checkCalendarSyncFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";

const createCalendarSyncSchema = z.object({
  provider: z.enum(["google", "outlook", "ical"]),
  calendar_id: z.string().optional(),
  calendar_name: z.string().optional(),
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  ical_url: z.string().url().optional(), // For iCal subscriptions
  sync_direction: z.enum(["app_to_calendar", "calendar_to_app", "bidirectional"]).default("bidirectional"),
  is_active: z.boolean().optional().default(true),
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * GET /api/provider/calendar/sync
 * 
 * List provider's calendar syncs
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Check subscription allows calendar sync
    const calendarAccess = await checkCalendarSyncFeatureAccess(providerId);
    if (!calendarAccess.enabled) {
      return errorResponse(
        "Calendar sync requires a subscription upgrade. Please upgrade to Starter plan or higher.",
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    const { data: syncs, error } = await supabase
      .from("calendar_syncs")
      .select("*")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse(syncs || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch calendar syncs");
  }
}

/**
 * POST /api/provider/calendar/sync
 * 
 * Create a new calendar sync
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Check subscription allows calendar sync
    const calendarAccess = await checkCalendarSyncFeatureAccess(providerId);
    if (!calendarAccess.enabled) {
      return errorResponse(
        "Calendar sync requires a subscription upgrade. Please upgrade to Starter plan or higher.",
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    const body = await request.json();
    const validated = createCalendarSyncSchema.parse(body);

    // Check if specific provider is allowed
    if (calendarAccess.providers && calendarAccess.providers.length > 0) {
      if (!calendarAccess.providers.includes(validated.provider)) {
        return errorResponse(
          `${validated.provider.charAt(0).toUpperCase() + validated.provider.slice(1)} calendar sync is not available on your plan. Please upgrade to access this calendar provider.`,
          "SUBSCRIPTION_REQUIRED",
          403
        );
      }
    }

    // Check API access for advanced features
    if (validated.sync_direction === "bidirectional" && !calendarAccess.apiAccess) {
      return errorResponse(
        "Bidirectional calendar sync requires an Enterprise plan. Please upgrade to access this feature.",
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    const { data: sync, error } = await supabase
      .from("calendar_syncs")
      .insert({
        provider_id: providerId,
        ...validated,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(sync);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request data", 400);
    }
    return handleApiError(error, "Failed to create calendar sync");
  }
}
