import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
  forbiddenResponse,
} from "@/lib/supabase/api-helpers";
import { checkStaffSmsNotificationsFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";

/**
 * GET /api/provider/staff/[id]/settings
 * 
 * Get staff member settings
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get staff member with all settings
    const { data: staff, error } = await supabase
      .from("provider_staff")
      .select(`
        id,
        name,
        email,
        phone,
        role,
        is_active,
        is_service_provider,
        enable_in_online_booking,
        can_be_assigned_to_product_sales,
        is_admin,
        email_notifications_enabled,
        sms_notifications_enabled,
        desktop_notifications_enabled,
        work_hours_enabled,
        commission_enabled,
        commission_rate,
        hourly_rate,
        salary,
        tips_enabled,
        time_clock_enabled,
        time_clock_pin,
        phone_call_availability_enabled,
        mobile_ready
      `)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !staff) {
      return notFoundResponse("Staff member not found");
    }

    const planAllowsSms = await checkStaffSmsNotificationsFeatureAccess(providerId, supabase);
    const rawStaffSms = staff.sms_notifications_enabled === true;

    // Map database role to API format
    const apiRole = staff.role === "owner" ? "provider_owner"
                 : staff.role === "manager" ? "provider_manager"
                 : "provider_staff";

    return successResponse({
      id: staff.id,
      name: staff.name,
      email: staff.email,
      phone: staff.phone,
      role: apiRole,
      is_active: staff.is_active ?? true,
      is_service_provider: staff.is_service_provider ?? true,
      enable_in_online_booking: staff.enable_in_online_booking ?? true,
      can_be_assigned_to_product_sales: staff.can_be_assigned_to_product_sales ?? false,
      // Only owner role defaults to admin; managers use permission packs (not full is_admin).
      is_admin: staff.is_admin ?? staff.role === "owner",
      email_notifications_enabled: staff.email_notifications_enabled ?? true,
      sms_notifications_enabled: planAllowsSms && rawStaffSms,
      sms_plan_allowed: planAllowsSms,
      desktop_notifications_enabled: staff.desktop_notifications_enabled ?? false,
      work_hours_enabled: staff.work_hours_enabled ?? true,
      commission_enabled: staff.commission_enabled ?? false,
      commission_rate: staff.commission_rate ?? 0,
      hourly_rate: staff.hourly_rate ?? 0,
      salary: staff.salary ?? 0,
      tips_enabled: staff.tips_enabled ?? true,
      time_clock_enabled: staff.time_clock_enabled ?? false,
      time_clock_pin: staff.time_clock_pin ?? "",
      phone_call_availability_enabled: staff.phone_call_availability_enabled ?? false,
      mobileReady: staff.mobile_ready ?? false,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch staff settings");
  }
}

const updateSettingsSchema = z.object({
  is_service_provider: z.boolean().optional(),
  enable_in_online_booking: z.boolean().optional(),
  can_be_assigned_to_product_sales: z.boolean().optional(),
  is_admin: z.boolean().optional(),
  email_notifications_enabled: z.boolean().optional(),
  sms_notifications_enabled: z.boolean().optional(),
  desktop_notifications_enabled: z.boolean().optional(),
  work_hours_enabled: z.boolean().optional(),
  commission_enabled: z.boolean().optional(),
  commission_rate: z.number().optional(),
  hourly_rate: z.number().optional(),
  salary: z.number().optional(),
  tips_enabled: z.boolean().optional(),
  time_clock_enabled: z.boolean().optional(),
  time_clock_pin: z.string().optional(),
  phone_call_availability_enabled: z.boolean().optional(),
  mobileReady: z.boolean().optional(),
});

/**
 * PATCH /api/provider/staff/[id]/settings
 *
 * Update staff member settings. Owners/superadmins: full schema. Staff: own row only,
 * limited keys (see STAFF_SELF_SETTINGS_KEYS).
 */

/** Fields a logged-in staff member may change on their own profile (not pay/commission). */
const STAFF_SELF_SETTINGS_KEYS = new Set([
  "work_hours_enabled",
  "email_notifications_enabled",
  "sms_notifications_enabled",
  "desktop_notifications_enabled",
  "mobileReady",
  "phone_call_availability_enabled",
  "tips_enabled",
  "time_clock_enabled",
  "time_clock_pin",
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    // Validate input
    const validationResult = updateSettingsSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify staff belongs to provider
    const { data: existingStaff } = await supabase
      .from("provider_staff")
      .select("id, user_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingStaff) {
      return notFoundResponse("Staff member not found");
    }

    const isOwnerOrSuper =
      user.role === "provider_owner" || user.role === "superadmin";
    const isSelfStaff =
      user.role === "provider_staff" &&
      existingStaff.user_id != null &&
      existingStaff.user_id === user.id;

    if (!isOwnerOrSuper && !isSelfStaff) {
      return errorResponse("Forbidden", "FORBIDDEN", 403);
    }

    // Map camelCase to snake_case for database
    let updateData: Record<string, unknown> = { ...validationResult.data };

    if (isSelfStaff && !isOwnerOrSuper) {
      updateData = Object.fromEntries(
        Object.entries(updateData).filter(([key]) => STAFF_SELF_SETTINGS_KEYS.has(key))
      );
      if (Object.keys(updateData).length === 0) {
        return errorResponse("No allowed fields to update", "VALIDATION_ERROR", 400);
      }
    }

    const mapped: any = { ...updateData };
    if (mapped.mobileReady !== undefined) {
      mapped.mobile_ready = mapped.mobileReady;
      delete mapped.mobileReady;
    }

    const planAllowsSms = await checkStaffSmsNotificationsFeatureAccess(providerId, supabase);
    if (mapped.sms_notifications_enabled === true && !planAllowsSms) {
      return forbiddenResponse(
        "SMS for team notifications is not included in your current plan. Upgrade to enable staff SMS."
      );
    }
    if (!planAllowsSms) {
      mapped.sms_notifications_enabled = false;
    }

    // Update settings
    const { data: updatedStaff, error: updateError } = await supabase
      .from("provider_staff")
      .update(mapped)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return successResponse(updatedStaff);
  } catch (error) {
    return handleApiError(error, "Failed to update staff settings");
  }
}
