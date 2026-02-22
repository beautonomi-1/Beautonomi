import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  advanceNoticeHours: z.number().int().min(0).max(168).optional(), // 0-168 hours (7 days)
  cancellationHours: z.number().int().min(0).max(168).optional(), // 0-168 hours (7 days)
});

/**
 * GET /api/provider/settings/online-booking
 * Get provider online booking settings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const providerIdParam = searchParams.get("provider_id"); // For superadmin to view specific provider

    // For superadmin, allow viewing any provider's settings
    let providerId: string | null = null;
    if (user.role === "superadmin" && providerIdParam) {
      providerId = providerIdParam;
    } else {
      // For providers, get their own provider ID
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) {
        return notFoundResponse("Provider not found");
      }
    }

    // Get online booking settings from providers table
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("online_booking_enabled, booking_advance_notice_hours, booking_cancellation_hours")
      .eq("id", providerId)
      .single();

    if (providerError) {
      throw providerError;
    }

    if (!provider) {
      return notFoundResponse("Provider not found");
    }

    // Transform to match UI expectations
    const result = {
      enabled: provider.online_booking_enabled ?? true, // Default to true if null
      advanceNoticeHours: provider.booking_advance_notice_hours ?? 24,
      cancellationHours: provider.booking_cancellation_hours ?? 24,
    };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load online booking settings");
  }
}

/**
 * PATCH /api/provider/settings/online-booking
 * Update provider online booking settings
 */
export async function PATCH(request: NextRequest) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate input
    const validationResult = updateSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Prepare updates
    const updates: any = {};
    if (validationResult.data.enabled !== undefined) {
      updates.online_booking_enabled = validationResult.data.enabled;
    }
    if (validationResult.data.advanceNoticeHours !== undefined) {
      updates.booking_advance_notice_hours = validationResult.data.advanceNoticeHours;
    }
    if (validationResult.data.cancellationHours !== undefined) {
      updates.booking_cancellation_hours = validationResult.data.cancellationHours;
    }

    // Update provider
    const { data: provider, error } = await supabase
      .from("providers")
      .update(updates)
      .eq("id", providerId)
      .select("online_booking_enabled, booking_advance_notice_hours, booking_cancellation_hours")
      .single();

    if (error) {
      throw error;
    }

    if (!provider) {
      return notFoundResponse("Provider not found");
    }

    // Return in the same format as GET
    const result = {
      enabled: provider.online_booking_enabled ?? true,
      advanceNoticeHours: provider.booking_advance_notice_hours ?? 24,
      cancellationHours: provider.booking_cancellation_hours ?? 24,
    };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to update online booking settings");
  }
}
