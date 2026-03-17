/**
 * GET /api/public/booking-holds/[id]
 *
 * Fetch a booking hold for continuation (after auth).
 * Returns hold if active and not expired.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getCancellationPolicy } from "@/lib/bookings/cancellation-policy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return handleApiError(
        new Error("Hold ID is required"),
        "Hold ID is required",
        "VALIDATION_ERROR",
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: hold, error } = await supabase
      .from("booking_holds")
      .select(
        "id, provider_id, staff_id, booking_services_snapshot, start_at, end_at, location_type, location_id, address_snapshot, hold_status, expires_at, created_by_user_id, guest_fingerprint_hash, metadata, created_at, providers(slug)"
      )
      .eq("id", id)
      .single();

    if (error || !hold) {
      return handleApiError(
        new Error("Hold not found"),
        "Hold not found or expired",
        "NOT_FOUND",
        404
      );
    }

    if (hold.hold_status !== "active") {
      return handleApiError(
        new Error("Hold is no longer active"),
        hold.hold_status === "expired"
          ? "Your hold has expired. Please select a new time."
          : "This slot is no longer available.",
        "HOLD_INACTIVE",
        410
      );
    }

    const expiresAt = new Date(hold.expires_at);
    if (expiresAt < new Date()) {
      return handleApiError(
        new Error("Hold has expired"),
        "Your hold has expired. Please select a new time.",
        "HOLD_EXPIRED",
        410
      );
    }

    const metadata = (hold.metadata as Record<string, any>) || {};
    const providerSlug = (hold.providers as { slug?: string } | null)?.slug ?? null;

    const { data: obSettings } = await supabase
      .from("provider_online_booking_settings")
      .select("on_demand_accept_enabled")
      .eq("provider_id", hold.provider_id)
      .maybeSingle();
    const provider_on_demand_accept_enabled = Boolean(obSettings?.on_demand_accept_enabled);

    const { data: providerRow } = await supabase
      .from("providers")
      .select("tips_enabled, tip_presets, currency")
      .eq("id", hold.provider_id)
      .maybeSingle();
    const tips_enabled = Boolean((providerRow as any)?.tips_enabled ?? true);
    const tip_presets = Array.isArray((providerRow as any)?.tip_presets)
      ? (providerRow as any).tip_presets.map((p: unknown) => Number(p)).filter((n: number) => !Number.isNaN(n) && n >= 0)
      : [10, 15, 20, 25];

    const locationType = (hold.location_type === "at_home" ? "at_home" : "at_salon") as "at_salon" | "at_home";
    const cancellationPolicyRow = await getCancellationPolicy(supabase, hold.provider_id, locationType);
    const cancellation_policy = cancellationPolicyRow
      ? {
          cancellation_window_hours: cancellationPolicyRow.hours_before_cutoff,
          currency: (providerRow as { currency?: string } | null)?.currency ?? "ZAR",
        }
      : undefined;

    return successResponse({
      hold_id: hold.id,
      provider_id: hold.provider_id,
      provider_slug: providerSlug,
      staff_id: hold.staff_id,
      booking_services_snapshot: hold.booking_services_snapshot,
      start_at: hold.start_at,
      end_at: hold.end_at,
      location_type: hold.location_type,
      location_id: hold.location_id,
      address_snapshot: hold.address_snapshot,
      hold_status: hold.hold_status,
      expires_at: hold.expires_at,
      metadata: hold.metadata,
      travel_fee: metadata.travel_fee != null ? Number(metadata.travel_fee) : undefined,
      travel_distance_km: metadata.travel_distance_km != null ? Number(metadata.travel_distance_km) : undefined,
      provider_on_demand_accept_enabled,
      tips_enabled,
      tip_presets,
      cancellation_policy,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch booking hold");
  }
}
