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

/**
 * Legacy-shaped online booking settings consumed by the **native provider app**
 * (apps/provider ...settings/online-booking.tsx). The native UI pre-dates the
 * mangomint-style `provider_online_booking_settings` table and uses a flatter
 * shape: { enabled, advanceNoticeHours, cancellationHours, requireDeposit,
 *          depositPercentage, allowGuestBooking, maxAdvanceDays }.
 *
 * §Provider-audit 2026-04: previously this route only accepted enabled/advance/
 * cancellation, and silently dropped requireDeposit / depositPercentage /
 * allowGuestBooking / maxAdvanceDays, so the native "Save Settings" button
 * returned 200 without persisting those fields. It also wrote to
 * `providers.booking_advance_notice_hours`, which is NOT what `/api/public/
 * booking-holds` or `/api/public/provider-online-booking-settings` read; the
 * public flow reads `provider_online_booking_settings.min_notice_minutes` and
 * siblings. We now mirror the accepted fields into that table so native
 * controls actually drive the public booking behaviour.
 *
 * We keep writing the `providers` columns for backward compatibility with any
 * legacy consumer that still reads them.
 */

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  advanceNoticeHours: z.number().int().min(0).max(168).optional(),
  cancellationHours: z.number().int().min(0).max(168).optional(),
  requireDeposit: z.boolean().optional(),
  depositPercentage: z.number().min(0).max(100).optional(),
  allowGuestBooking: z.boolean().optional(),
  maxAdvanceDays: z.number().int().min(1).max(365).optional(),
});

type FlatSettings = {
  enabled: boolean;
  advanceNoticeHours: number;
  cancellationHours: number;
  requireDeposit: boolean;
  depositPercentage: number;
  allowGuestBooking: boolean;
  maxAdvanceDays: number;
};

const DEFAULTS: FlatSettings = {
  enabled: true,
  advanceNoticeHours: 24,
  cancellationHours: 24,
  requireDeposit: false,
  depositPercentage: 50,
  allowGuestBooking: true,
  maxAdvanceDays: 90,
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

    const [{ data: provider, error: providerError }, { data: mangomint }] = await Promise.all([
      supabase
        .from("providers")
        .select("online_booking_enabled, booking_advance_notice_hours, booking_cancellation_hours")
        .eq("id", providerId)
        .single(),
      supabase
        .from("provider_online_booking_settings")
        .select("min_notice_minutes, max_advance_days, deposit_required, deposit_percent, require_auth_step")
        .eq("provider_id", providerId)
        .maybeSingle(),
    ]);

    if (providerError) throw providerError;
    if (!provider) return notFoundResponse("Provider not found");

    // Prefer mangomint values when present; fall back to legacy provider cols.
    const advanceHoursFromMinutes =
      mangomint?.min_notice_minutes != null
        ? Math.round(Number(mangomint.min_notice_minutes) / 60)
        : null;

    const result: FlatSettings = {
      enabled: provider.online_booking_enabled ?? DEFAULTS.enabled,
      advanceNoticeHours:
        advanceHoursFromMinutes ??
        provider.booking_advance_notice_hours ??
        DEFAULTS.advanceNoticeHours,
      cancellationHours: provider.booking_cancellation_hours ?? DEFAULTS.cancellationHours,
      requireDeposit: mangomint?.deposit_required ?? DEFAULTS.requireDeposit,
      depositPercentage:
        mangomint?.deposit_percent != null
          ? Number(mangomint.deposit_percent)
          : DEFAULTS.depositPercentage,
      allowGuestBooking:
        mangomint?.require_auth_step === "before_time_selection"
          ? false
          : DEFAULTS.allowGuestBooking,
      maxAdvanceDays: mangomint?.max_advance_days ?? DEFAULTS.maxAdvanceDays,
    };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load online booking settings");
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

    const validationResult = updateSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }
    const data = validationResult.data;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // ── 1. Legacy provider columns (backward compat for any consumer) ──
    const providerUpdates: Record<string, any> = {};
    if (data.enabled !== undefined) providerUpdates.online_booking_enabled = data.enabled;
    if (data.advanceNoticeHours !== undefined)
      providerUpdates.booking_advance_notice_hours = data.advanceNoticeHours;
    if (data.cancellationHours !== undefined)
      providerUpdates.booking_cancellation_hours = data.cancellationHours;
    if (data.requireDeposit !== undefined) providerUpdates.requires_deposit = data.requireDeposit;
    if (data.depositPercentage !== undefined) providerUpdates.deposit_percentage = data.depositPercentage;

    if (Object.keys(providerUpdates).length > 0) {
      const { error: providerUpdateError } = await supabase
        .from("providers")
        .update(providerUpdates)
        .eq("id", providerId);
      if (providerUpdateError) throw providerUpdateError;
    }

    // ── 2. Mangomint settings (authoritative for public flow) ──
    const mangomintUpdates: Record<string, any> = {};
    if (data.advanceNoticeHours !== undefined) {
      mangomintUpdates.min_notice_minutes = data.advanceNoticeHours * 60;
    }
    if (data.maxAdvanceDays !== undefined) mangomintUpdates.max_advance_days = data.maxAdvanceDays;
    if (data.requireDeposit !== undefined) mangomintUpdates.deposit_required = data.requireDeposit;
    if (data.depositPercentage !== undefined) mangomintUpdates.deposit_percent = data.depositPercentage;
    if (data.allowGuestBooking !== undefined) {
      // Guest booking = customer can check out without auth; non-guest requires auth before time selection.
      mangomintUpdates.require_auth_step = data.allowGuestBooking ? "checkout" : "before_time_selection";
    }

    if (Object.keys(mangomintUpdates).length > 0) {
      mangomintUpdates.updated_at = new Date().toISOString();
      const { error: mangomintError } = await supabase
        .from("provider_online_booking_settings")
        .upsert(
          { provider_id: providerId, ...mangomintUpdates },
          { onConflict: "provider_id" }
        );
      if (mangomintError) throw mangomintError;
    }

    // ── 3. Return the re-read, merged shape ──
    const [{ data: provider }, { data: mangomint }] = await Promise.all([
      supabase
        .from("providers")
        .select("online_booking_enabled, booking_advance_notice_hours, booking_cancellation_hours")
        .eq("id", providerId)
        .single(),
      supabase
        .from("provider_online_booking_settings")
        .select("min_notice_minutes, max_advance_days, deposit_required, deposit_percent, require_auth_step")
        .eq("provider_id", providerId)
        .maybeSingle(),
    ]);

    const advanceHoursFromMinutes =
      mangomint?.min_notice_minutes != null
        ? Math.round(Number(mangomint.min_notice_minutes) / 60)
        : null;

    const result: FlatSettings = {
      enabled: provider?.online_booking_enabled ?? DEFAULTS.enabled,
      advanceNoticeHours:
        advanceHoursFromMinutes ??
        provider?.booking_advance_notice_hours ??
        DEFAULTS.advanceNoticeHours,
      cancellationHours: provider?.booking_cancellation_hours ?? DEFAULTS.cancellationHours,
      requireDeposit: mangomint?.deposit_required ?? DEFAULTS.requireDeposit,
      depositPercentage:
        mangomint?.deposit_percent != null
          ? Number(mangomint.deposit_percent)
          : DEFAULTS.depositPercentage,
      allowGuestBooking:
        mangomint?.require_auth_step === "before_time_selection"
          ? false
          : DEFAULTS.allowGuestBooking,
      maxAdvanceDays: mangomint?.max_advance_days ?? DEFAULTS.maxAdvanceDays,
    };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to update online booking settings");
  }
}
