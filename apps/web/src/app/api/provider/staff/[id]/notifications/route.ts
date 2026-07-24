import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
  forbiddenResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { isProviderOwner } from "@/lib/auth/permissions";
import { resolveProviderStaffRowId } from "@/lib/provider/resolve-provider-staff-id";
import { checkStaffSmsNotificationsFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";

const patchSchema = z.object({
  email_enabled: z.boolean().optional(),
  sms_enabled: z.boolean().optional(),
  desktop_enabled: z.boolean().optional(),
  appointment_reminders: z.boolean().optional(),
  appointment_cancellations: z.boolean().optional(),
  appointment_reschedules: z.boolean().optional(),
  new_bookings: z.boolean().optional(),
  daily_schedule: z.boolean().optional(),
  weekly_schedule: z.boolean().optional(),
  reminder_time: z.string().optional(),
});

/**
 * GET /api/provider/staff/[id]/notifications
 * Get notification settings for a staff member
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify staff member belongs to provider (provider_staff — same ids as /api/provider/staff)
    const { data: staff, error: staffError } = await supabase
      .from("provider_staff")
      .select("id, notification_settings")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (staffError || !staff) {
      return notFoundResponse("Staff member not found");
    }

    const notificationSettings = staff.notification_settings
      ? typeof staff.notification_settings === "string"
        ? JSON.parse(staff.notification_settings)
        : staff.notification_settings
      : {};

    const planAllowsSms = await checkStaffSmsNotificationsFeatureAccess(providerId, supabase);
    const rawSms = notificationSettings.sms_enabled === true;

    // Default values (SMS off until explicitly enabled; effective SMS also requires plan)
    return successResponse({
      emailEnabled: notificationSettings.email_enabled ?? true,
      smsEnabled: planAllowsSms && rawSms,
      smsPlanAllowed: planAllowsSms,
      desktopEnabled: notificationSettings.desktop_enabled ?? false,
      appointmentReminders: notificationSettings.appointment_reminders ?? true,
      appointmentCancellations: notificationSettings.appointment_cancellations ?? true,
      appointmentReschedules: notificationSettings.appointment_reschedules ?? true,
      newBookings: notificationSettings.new_bookings ?? true,
      dailySchedule: notificationSettings.daily_schedule ?? true,
      weeklySchedule: notificationSettings.weekly_schedule ?? false,
      reminderTime: notificationSettings.reminder_time ?? "24h",
    });
  } catch (error) {
    return handleApiError(error, "Failed to load notification settings");
  }
}

/**
 * PATCH /api/provider/staff/[id]/notifications
 * Update notification settings for a staff member
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission("view_calendar", request);
    if (!authCheck.authorized) {
      return authCheck.response!;
    }
    const { user } = authCheck;
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const resolvedStaffId = await resolveProviderStaffRowId(supabase, providerId, id);
    if (!resolvedStaffId) {
      return notFoundResponse("Staff member not found");
    }

    const owner = await isProviderOwner(user.id, request);
    if (!owner) {
      const { data: selfStaff } = await supabase
        .from("provider_staff")
        .select("id")
        .eq("provider_id", providerId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      const isSelf = selfStaff?.id === resolvedStaffId;
      if (!isSelf) {
        const manageCheck = await requirePermission("manage_team", request);
        if (!manageCheck.authorized) {
          return manageCheck.response!;
        }
      }
    }

    const body = patchSchema.parse(await request.json());

    const planAllowsSms = await checkStaffSmsNotificationsFeatureAccess(providerId, supabase);
    if (body.sms_enabled === true && !planAllowsSms) {
      return forbiddenResponse(
        "SMS for team notifications is not included in your current plan. Upgrade to enable staff SMS."
      );
    }

    // Verify staff member belongs to provider
    const { data: existing } = await supabase
      .from("provider_staff")
      .select("id, notification_settings")
      .eq("id", resolvedStaffId)
      .eq("provider_id", providerId)
      .single();

    if (!existing) {
      return notFoundResponse("Staff member not found");
    }

    // Get existing settings
    const existingSettings = existing.notification_settings
      ? typeof existing.notification_settings === "string"
        ? JSON.parse(existing.notification_settings)
        : existing.notification_settings
      : {};

    // Merge with new settings (always persist sms_enabled false when plan disallows SMS)
    const updatedSettings: Record<string, unknown> = {
      ...existingSettings,
      ...(body.email_enabled !== undefined && { email_enabled: body.email_enabled }),
      ...(body.desktop_enabled !== undefined && { desktop_enabled: body.desktop_enabled }),
      ...(body.appointment_reminders !== undefined && {
        appointment_reminders: body.appointment_reminders,
      }),
      ...(body.appointment_cancellations !== undefined && {
        appointment_cancellations: body.appointment_cancellations,
      }),
      ...(body.appointment_reschedules !== undefined && {
        appointment_reschedules: body.appointment_reschedules,
      }),
      ...(body.new_bookings !== undefined && { new_bookings: body.new_bookings }),
      ...(body.daily_schedule !== undefined && { daily_schedule: body.daily_schedule }),
      ...(body.weekly_schedule !== undefined && { weekly_schedule: body.weekly_schedule }),
      ...(body.reminder_time !== undefined && { reminder_time: body.reminder_time }),
    };
    if (!planAllowsSms) {
      updatedSettings.sms_enabled = false;
    } else if (body.sms_enabled !== undefined) {
      updatedSettings.sms_enabled = body.sms_enabled;
    }

    const { data, error } = await supabase
      .from("provider_staff")
      .update({
        notification_settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", resolvedStaffId)
      .select("notification_settings")
      .single();

    if (error) {
      throw error;
    }

    const notificationSettings = data?.notification_settings
      ? typeof data.notification_settings === "string"
        ? JSON.parse(data.notification_settings)
        : data.notification_settings
      : {};

    const rawSmsAfter = notificationSettings.sms_enabled === true;

    return successResponse({
      emailEnabled: notificationSettings.email_enabled ?? true,
      smsEnabled: planAllowsSms && rawSmsAfter,
      smsPlanAllowed: planAllowsSms,
      desktopEnabled: notificationSettings.desktop_enabled ?? false,
      appointmentReminders: notificationSettings.appointment_reminders ?? true,
      appointmentCancellations: notificationSettings.appointment_cancellations ?? true,
      appointmentReschedules: notificationSettings.appointment_reschedules ?? true,
      newBookings: notificationSettings.new_bookings ?? true,
      dailySchedule: notificationSettings.daily_schedule ?? true,
      weeklySchedule: notificationSettings.weekly_schedule ?? false,
      reminderTime: notificationSettings.reminder_time ?? "24h",
    });
  } catch (error) {
    return handleApiError(error, "Failed to update notification settings");
  }
}
