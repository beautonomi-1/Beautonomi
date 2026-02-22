/**
 * GET /api/provider/settings/online-booking-mangomint
 * PATCH /api/provider/settings/online-booking-mangomint
 *
 * Mangomint-style online booking settings (provider_online_booking_settings table).
 */

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

const mangomintUpdateSchema = z.object({
  staff_selection_mode: z
    .enum(["client_chooses", "anyone_default", "hidden_auto_assign"])
    .optional(),
  require_auth_step: z
    .enum(["checkout", "before_time_selection"])
    .optional(),
  min_notice_minutes: z.number().int().min(0).max(10080).optional(), // 0-7 days
  max_advance_days: z.number().int().min(1).max(365).optional(),
  allow_pay_in_person: z.boolean().optional(),
  deposit_required: z.boolean().optional(),
  deposit_amount: z.number().min(0).optional().nullable(),
  deposit_percent: z.number().min(0).max(100).optional().nullable(),
});

export type MangomintSettings = {
  staff_selection_mode: "client_chooses" | "anyone_default" | "hidden_auto_assign";
  require_auth_step: "checkout" | "before_time_selection";
  min_notice_minutes: number;
  max_advance_days: number;
  allow_pay_in_person: boolean;
  deposit_required: boolean;
  deposit_amount: number | null;
  deposit_percent: number | null;
};

const defaults: MangomintSettings = {
  staff_selection_mode: "client_chooses",
  require_auth_step: "checkout",
  min_notice_minutes: 60,
  max_advance_days: 90,
  allow_pay_in_person: false,
  deposit_required: false,
  deposit_amount: null,
  deposit_percent: null,
};

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const providerIdParam = searchParams.get("provider_id");

    let providerId: string | null = null;
    if (user.role === "superadmin" && providerIdParam) {
      providerId = providerIdParam;
    } else {
      providerId = await getProviderIdForUser(user.id, supabase);
    }

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: settings, error } = await supabase
      .from("provider_online_booking_settings")
      .select("*")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) throw error;

    const result: MangomintSettings = settings
      ? {
          staff_selection_mode:
            (settings.staff_selection_mode as MangomintSettings["staff_selection_mode"]) ||
            defaults.staff_selection_mode,
          require_auth_step:
            (settings.require_auth_step as MangomintSettings["require_auth_step"]) ||
            defaults.require_auth_step,
          min_notice_minutes: settings.min_notice_minutes ?? defaults.min_notice_minutes,
          max_advance_days: settings.max_advance_days ?? defaults.max_advance_days,
          allow_pay_in_person: settings.allow_pay_in_person ?? defaults.allow_pay_in_person,
          deposit_required: settings.deposit_required ?? defaults.deposit_required,
          deposit_amount: settings.deposit_amount != null ? Number(settings.deposit_amount) : null,
          deposit_percent: settings.deposit_percent != null ? Number(settings.deposit_percent) : null,
        }
      : { ...defaults };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load Mangomint settings");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validationResult = mangomintUpdateSchema.safeParse(body);
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

    const data = validationResult.data;
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (data.staff_selection_mode !== undefined) updates.staff_selection_mode = data.staff_selection_mode;
    if (data.require_auth_step !== undefined) updates.require_auth_step = data.require_auth_step;
    if (data.min_notice_minutes !== undefined) updates.min_notice_minutes = data.min_notice_minutes;
    if (data.max_advance_days !== undefined) updates.max_advance_days = data.max_advance_days;
    if (data.allow_pay_in_person !== undefined) updates.allow_pay_in_person = data.allow_pay_in_person;
    if (data.deposit_required !== undefined) updates.deposit_required = data.deposit_required;
    if (data.deposit_amount !== undefined) updates.deposit_amount = data.deposit_amount;
    if (data.deposit_percent !== undefined) updates.deposit_percent = data.deposit_percent;

    const { error: upsertError } = await supabase
      .from("provider_online_booking_settings")
      .upsert(
        {
          provider_id: providerId,
          ...updates,
        },
        { onConflict: "provider_id" }
      );

    if (upsertError) throw upsertError;

    const { data: updated, error: fetchError } = await supabase
      .from("provider_online_booking_settings")
      .select("*")
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !updated) {
      return successResponse({
        ...defaults,
        ...updates,
      } as MangomintSettings);
    }

    const result: MangomintSettings = {
      staff_selection_mode:
        (updated.staff_selection_mode as MangomintSettings["staff_selection_mode"]) ||
        defaults.staff_selection_mode,
      require_auth_step:
        (updated.require_auth_step as MangomintSettings["require_auth_step"]) ||
        defaults.require_auth_step,
      min_notice_minutes: updated.min_notice_minutes ?? defaults.min_notice_minutes,
      max_advance_days: updated.max_advance_days ?? defaults.max_advance_days,
      allow_pay_in_person: updated.allow_pay_in_person ?? defaults.allow_pay_in_person,
      deposit_required: updated.deposit_required ?? defaults.deposit_required,
      deposit_amount:
        updated.deposit_amount != null ? Number(updated.deposit_amount) : null,
      deposit_percent:
        updated.deposit_percent != null ? Number(updated.deposit_percent) : null,
    };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to update Mangomint settings");
  }
}
