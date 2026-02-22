import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const patchSchema = z.object({
  enable_intelligent_waitlist: z.boolean().optional(),
  auto_notify_on_availability: z.boolean().optional(),
  notify_priority_first: z.boolean().optional(),
  notification_delay_minutes: z.number().min(0).max(60).optional(),
  allow_client_self_check_in: z.boolean().optional(),
  allow_online_waitlist: z.boolean().optional(),
  max_waitlist_size: z.number().min(10).max(500).optional(),
  auto_remove_after_days: z.number().min(1).max(365).optional(),
  enable_virtual_waiting_room: z.boolean().optional(),
  show_estimated_wait_time: z.boolean().optional(),
});

/**
 * GET /api/provider/settings/waitlist
 * Get waitlist settings
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

    const { data: provider, error } = await supabase
      .from("providers")
      .select(
        "waitlist_intelligent_enabled, waitlist_auto_notify, waitlist_notify_priority_first, waitlist_notification_delay_minutes, waitlist_client_self_checkin, waitlist_online_enabled, waitlist_max_size, waitlist_auto_remove_days, waitlist_virtual_room_enabled, waitlist_show_estimated_time"
      )
      .eq("id", providerId)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return successResponse({
      enableIntelligentWaitlist: provider?.waitlist_intelligent_enabled ?? true,
      autoNotifyOnAvailability: provider?.waitlist_auto_notify ?? true,
      notifyPriorityFirst: provider?.waitlist_notify_priority_first ?? true,
      notificationDelayMinutes: provider?.waitlist_notification_delay_minutes ?? 0,
      allowClientSelfCheckIn: provider?.waitlist_client_self_checkin ?? true,
      allowOnlineWaitlist: provider?.waitlist_online_enabled ?? true,
      maxWaitlistSize: provider?.waitlist_max_size ?? 50,
      autoRemoveAfterDays: provider?.waitlist_auto_remove_days ?? 30,
      enableVirtualWaitingRoom: provider?.waitlist_virtual_room_enabled ?? true,
      showEstimatedWaitTime: provider?.waitlist_show_estimated_time ?? true,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load waitlist settings");
  }
}

/**
 * PATCH /api/provider/settings/waitlist
 * Update waitlist settings
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
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const body = patchSchema.parse(await request.json());

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.enable_intelligent_waitlist !== undefined) {
      updateData.waitlist_intelligent_enabled = body.enable_intelligent_waitlist;
    }
    if (body.auto_notify_on_availability !== undefined) {
      updateData.waitlist_auto_notify = body.auto_notify_on_availability;
    }
    if (body.notify_priority_first !== undefined) {
      updateData.waitlist_notify_priority_first = body.notify_priority_first;
    }
    if (body.notification_delay_minutes !== undefined) {
      updateData.waitlist_notification_delay_minutes = body.notification_delay_minutes;
    }
    if (body.allow_client_self_check_in !== undefined) {
      updateData.waitlist_client_self_checkin = body.allow_client_self_check_in;
    }
    if (body.allow_online_waitlist !== undefined) {
      updateData.waitlist_online_enabled = body.allow_online_waitlist;
    }
    if (body.max_waitlist_size !== undefined) {
      updateData.waitlist_max_size = body.max_waitlist_size;
    }
    if (body.auto_remove_after_days !== undefined) {
      updateData.waitlist_auto_remove_days = body.auto_remove_after_days;
    }
    if (body.enable_virtual_waiting_room !== undefined) {
      updateData.waitlist_virtual_room_enabled = body.enable_virtual_waiting_room;
    }
    if (body.show_estimated_wait_time !== undefined) {
      updateData.waitlist_show_estimated_time = body.show_estimated_wait_time;
    }

    const { data, error } = await supabase
      .from("providers")
      .update(updateData)
      .eq("id", providerId)
      .select(
        "waitlist_intelligent_enabled, waitlist_auto_notify, waitlist_notify_priority_first, waitlist_notification_delay_minutes, waitlist_client_self_checkin, waitlist_online_enabled, waitlist_max_size, waitlist_auto_remove_days, waitlist_virtual_room_enabled, waitlist_show_estimated_time"
      )
      .single();

    if (error) {
      throw error;
    }

    return successResponse({
      enableIntelligentWaitlist: data?.waitlist_intelligent_enabled ?? true,
      autoNotifyOnAvailability: data?.waitlist_auto_notify ?? true,
      notifyPriorityFirst: data?.waitlist_notify_priority_first ?? true,
      notificationDelayMinutes: data?.waitlist_notification_delay_minutes ?? 0,
      allowClientSelfCheckIn: data?.waitlist_client_self_checkin ?? true,
      allowOnlineWaitlist: data?.waitlist_online_enabled ?? true,
      maxWaitlistSize: data?.waitlist_max_size ?? 50,
      autoRemoveAfterDays: data?.waitlist_auto_remove_days ?? 30,
      enableVirtualWaitingRoom: data?.waitlist_virtual_room_enabled ?? true,
      showEstimatedWaitTime: data?.waitlist_show_estimated_time ?? true,
    });
  } catch (error) {
    return handleApiError(error, "Failed to update waitlist settings");
  }
}
