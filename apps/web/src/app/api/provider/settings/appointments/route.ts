import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { APPOINTMENT_STATUS, DEFAULT_APPOINTMENT_STATUS } from "@/lib/provider-portal/constants";

/**
 * GET /api/provider/settings/appointments
 * Get provider appointment settings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    // Get provider appointment settings
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("default_appointment_status, auto_confirm_appointments, require_confirmation_for_bookings, appointment_settings_updated_at")
      .eq("id", providerId)
      .single();

    if (providerError) {
      throw providerError;
    }

    // Return settings with defaults if not set
    const result = {
      defaultAppointmentStatus: provider?.default_appointment_status || DEFAULT_APPOINTMENT_STATUS,
      autoConfirmAppointments: provider?.auto_confirm_appointments ?? false,
      requireConfirmationForBookings: provider?.require_confirmation_for_bookings ?? true,
      updatedAt: provider?.appointment_settings_updated_at || null,
      // Include available status options for UI
      availableStatuses: Object.values(APPOINTMENT_STATUS),
    };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load appointment settings");
  }
}

/**
 * PATCH /api/provider/settings/appointments
 * Update provider appointment settings
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
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    // Validate default_appointment_status if provided
    if (body.defaultAppointmentStatus !== undefined) {
      const validStatuses = Object.values(APPOINTMENT_STATUS);
      if (!validStatuses.includes(body.defaultAppointmentStatus)) {
        return handleApiError(
          new Error(`Invalid status: ${body.defaultAppointmentStatus}. Must be one of: ${validStatuses.join(', ')}`),
          "Invalid appointment status",
          "VALIDATION_ERROR",
          400
        );
      }
    }

    const updates: any = {};

    if (body.defaultAppointmentStatus !== undefined) {
      updates.default_appointment_status = body.defaultAppointmentStatus;
    }
    if (body.autoConfirmAppointments !== undefined) {
      updates.auto_confirm_appointments = body.autoConfirmAppointments;
    }
    if (body.requireConfirmationForBookings !== undefined) {
      updates.require_confirmation_for_bookings = body.requireConfirmationForBookings;
    }

    // Only update if there are changes
    if (Object.keys(updates).length === 0) {
      return successResponse({ message: "No changes provided" });
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .update(updates)
      .eq("id", providerId)
      .select("default_appointment_status, auto_confirm_appointments, require_confirmation_for_bookings, appointment_settings_updated_at")
      .single();

    if (error) {
      throw error;
    }

    return successResponse({
      defaultAppointmentStatus: provider.default_appointment_status || DEFAULT_APPOINTMENT_STATUS,
      autoConfirmAppointments: provider.auto_confirm_appointments ?? false,
      requireConfirmationForBookings: provider.require_confirmation_for_bookings ?? true,
      updatedAt: provider.appointment_settings_updated_at,
    });
  } catch (error) {
    return handleApiError(error, "Failed to update appointment settings");
  }
}
