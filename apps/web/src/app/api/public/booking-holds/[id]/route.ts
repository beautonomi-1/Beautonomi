/**
 * GET /api/public/booking-holds/[id]
 *
 * Fetch a booking hold for continuation (after auth).
 * Returns hold if active and not expired.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";
import { getCancellationPolicy } from "@/lib/bookings/cancellation-policy";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getPaymentFeatureFlagsForTenant } from "@/lib/subscriptions/entitlements";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { getRequestNowAvailability } from "@/lib/on-demand/request-now-availability";

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

    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) {
      return tenantRes;
    }
    const { tenantId } = tenantRes;

    const supabase = getSupabaseAdmin();

    const { data: hold, error } = await supabase
      .from("booking_holds")
      .select(
        "id, provider_id, staff_id, booking_services_snapshot, start_at, end_at, location_type, location_id, address_snapshot, hold_status, expires_at, created_by_user_id, guest_fingerprint_hash, metadata, created_at, providers!inner(slug, tenant_id)"
      )
      .eq("id", id)
      .eq("providers.tenant_id", tenantId)
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
      await supabase
        .from("booking_holds")
        .update({ hold_status: "expired" })
        .eq("id", hold.id)
        .eq("hold_status", "active");
      return handleApiError(
        new Error("Hold has expired"),
        "Your hold has expired. Please select a new time.",
        "HOLD_EXPIRED",
        410
      );
    }

    const metadata = (hold.metadata as Record<string, any>) || {};
    const packageIdFromMetadata =
      typeof metadata.package_id === "string" && metadata.package_id.trim()
        ? metadata.package_id.trim()
        : typeof metadata.primary_package_id === "string" && metadata.primary_package_id.trim()
          ? metadata.primary_package_id.trim()
          : undefined;
    const staffNameFromSolo =
      !hold.staff_id && metadata.public_booking_staff_id
        ? (metadata.solo_staff_display_name as string | undefined)
        : undefined;
    const providerSlug = (hold.providers as { slug?: string } | null)?.slug ?? null;

    const { data: obSettings } = await supabase
      .from("provider_online_booking_settings")
      .select("on_demand_accept_enabled")
      .eq("provider_id", hold.provider_id)
      .maybeSingle();
    const requestNow = await getRequestNowAvailability({
      tenantId,
      role: "customer",
      surface: "customer",
    });
    const provider_on_demand_accept_enabled = Boolean(
      requestNow.enabled && obSettings?.on_demand_accept_enabled,
    );

    const { data: providerRow } = await supabase
      .from("providers")
      .select(
        "tips_enabled, tip_presets, currency, no_show_fee_enabled, no_show_fee_amount, requires_deposit, deposit_percentage, tax_rate_percent, tax_inclusive, customer_fee_config_id"
      )
      .eq("id", hold.provider_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const tenantRegion = await getTenantRegionConfig(tenantId);
    const tenantDefaultCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const tips_enabled = Boolean((providerRow as any)?.tips_enabled ?? true);
    const tip_presets = Array.isArray((providerRow as any)?.tip_presets)
      ? (providerRow as any).tip_presets.map((p: unknown) => Number(p)).filter((n: number) => !Number.isNaN(n) && n >= 0)
      : [10, 15, 20, 25];

    const locationType = (hold.location_type === "at_home" ? "at_home" : "at_salon") as "at_salon" | "at_home";
    const cancellationPolicyRow = await getCancellationPolicy(supabase, hold.provider_id, locationType);
    const prov = providerRow as {
      currency?: string;
      no_show_fee_enabled?: boolean;
      no_show_fee_amount?: number | null;
      requires_deposit?: boolean | null;
      deposit_percentage?: number | null;
    } | null;

    const requiresDeposit = Boolean(prov?.requires_deposit);
    const depositPctRaw = prov?.deposit_percentage;
    const depositPercentage =
      depositPctRaw != null && !Number.isNaN(Number(depositPctRaw))
        ? Number(depositPctRaw)
        : requiresDeposit
          ? 30
          : 0;

    const paymentFlags = await getPaymentFeatureFlagsForTenant(tenantId);
    const lateRefundPct =
      cancellationPolicyRow.refund_percentage !== undefined &&
      cancellationPolicyRow.refund_percentage !== null
        ? Number(cancellationPolicyRow.refund_percentage)
        : cancellationPolicyRow.late_cancellation_type === "full_refund"
          ? 100
          : cancellationPolicyRow.late_cancellation_type === "partial_refund"
            ? 50
            : 0;
    const cancellation_policy = {
      cancellation_window_hours: cancellationPolicyRow.hours_before_cutoff,
      grace_window_minutes: cancellationPolicyRow.grace_window_minutes,
      policy_text: cancellationPolicyRow.policy_text,
      late_refund_percentage: lateRefundPct,
      fee_amount:
        cancellationPolicyRow.fee_amount != null && Number(cancellationPolicyRow.fee_amount) > 0
          ? Number(cancellationPolicyRow.fee_amount)
          : undefined,
      fee_type: cancellationPolicyRow.fee_type as "fixed" | "percentage" | undefined,
      currency: prov?.currency ?? tenantDefaultCurrency,
      no_show_fee_enabled: Boolean(prov?.no_show_fee_enabled),
      no_show_fee_amount:
        prov?.no_show_fee_amount != null && prov.no_show_fee_enabled
          ? Number(prov.no_show_fee_amount)
          : undefined,
    };

    // Resolve tax rate from provider (optional - 0 when provider hasn't set one)
    const providerTaxRate = (providerRow as any)?.tax_rate_percent != null
      ? Math.max(0, Number((providerRow as any).tax_rate_percent))
      : 0;
    const taxInclusive = Boolean((providerRow as any)?.tax_inclusive ?? false);

    // Resolve service fee config (same priority as validate-booking / platform-fees API)
    let serviceFeeConfig = {
      type: "fixed" as string,
      percentage: 0,
      fixed: 0,
      show: false,
    };
    try {
      const customerFeeConfigId = (providerRow as any)?.customer_fee_config_id;
      if (customerFeeConfigId) {
        const { data: feeConfig } = await supabase
          .from("platform_fee_config")
          .select("fee_type, fee_percentage, fee_fixed_amount, applies_to, is_active")
          .eq("id", customerFeeConfigId)
          .eq("is_active", true)
          .maybeSingle();
        if (feeConfig) {
          const isPercentage = feeConfig.fee_type === "percentage";
          serviceFeeConfig = {
            type: isPercentage ? "percentage" : "fixed",
            percentage: isPercentage ? Number(feeConfig.fee_percentage || 0) : 0,
            fixed: isPercentage ? 0 : Number(feeConfig.fee_fixed_amount || 0),
            show: feeConfig.applies_to === "customer" || feeConfig.applies_to === "both",
          };
        }
      }
      if (!serviceFeeConfig.show && serviceFeeConfig.percentage === 0 && serviceFeeConfig.fixed === 0) {
        const scoped = await fetchScopedSingle<Record<string, unknown>>({
          supabase,
          table: "platform_settings",
          tenantId,
          select: "settings",
          apply: (q: any) => q.eq("is_active", true),
          orderBy: { column: "updated_at", ascending: false },
        });
        const settings = (scoped.data as { settings?: Record<string, unknown> } | null)?.settings;
        const payoutSettings = (settings as Record<string, any> | undefined)?.payouts as Record<string, any> | undefined;
        if (payoutSettings) {
          serviceFeeConfig = {
            type: (payoutSettings.platform_service_fee_type as string) || "fixed",
            percentage: (payoutSettings.platform_service_fee_percentage as number) ?? 0,
            fixed: (payoutSettings.platform_service_fee_fixed as number) ?? 0,
            show: (payoutSettings.show_service_fee_to_customer as boolean) !== false,
          };
        }
      }
    } catch {
      // Non-critical — checkout will still work; server calculates the authoritative total
    }

    return successResponse({
      /** ISO time from server — use with client `Date.now()` to correct clock skew for hold countdowns. */
      server_now: new Date().toISOString(),
      hold_id: hold.id,
      provider_id: hold.provider_id,
      provider_slug: providerSlug,
      staff_id: hold.staff_id,
      staff_name: staffNameFromSolo,
      booking_services_snapshot: hold.booking_services_snapshot,
      start_at: hold.start_at,
      end_at: hold.end_at,
      location_type: hold.location_type,
      location_id: hold.location_id,
      address_snapshot: hold.address_snapshot,
      hold_status: hold.hold_status,
      expires_at: hold.expires_at,
      metadata: hold.metadata,
      package_id: packageIdFromMetadata,
      travel_fee: metadata.travel_fee != null ? Number(metadata.travel_fee) : undefined,
      travel_distance_km: metadata.travel_distance_km != null ? Number(metadata.travel_distance_km) : undefined,
      provider_on_demand_accept_enabled,
      tips_enabled,
      tip_presets,
      cancellation_policy,
      deposit_required: requiresDeposit,
      deposit_percentage: depositPercentage,
      payment_paystack: paymentFlags.payment_paystack,
      payment_wallet: paymentFlags.payment_wallet,
      gift_cards: paymentFlags.gift_cards,
      tax_rate_percent: providerTaxRate,
      tax_inclusive: taxInclusive,
      service_fee_config: serviceFeeConfig,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch booking hold");
  }
}
