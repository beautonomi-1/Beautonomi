/**
 * Custom offer pricing: tax, Platform Fee, promo code, membership, loyalty, tip.
 * Mirrors logic from validate-booking for consistency.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { resolveCheckoutPromotionDiscount } from "@/lib/pricing/checkout-promotion-discount";
import { getPlatformDefaultTaxRateAndInclusive } from "@/lib/pricing/checkout-tax-defaults";
import { percentOf, sumMoney } from "@beautonomi/utils";

export interface CustomOfferPricingInput {
  offerPrice: number;
  travelFee: number;
  currency: string;
  providerId: string;
  customerId: string;
  /** Host / market tenant (used with provider.tenant_id for scoped platform_settings). */
  tenantId: string;
  /** Service-role client for tenant-scoped platform_settings (matches validate-booking). */
  supabaseAdmin: SupabaseClient;
  tipAmount?: number;
  promotionCode?: string | null;
  locationType?: "at_salon" | "at_home";
  locationId?: string | null;
  /** Same semantics as booking `loyalty_points_used`. */
  loyaltyPointsRequested?: number;
}

export interface CustomOfferPricingResult {
  subtotal: number;
  travelFee: number;
  promotionId: string | null;
  promotionDiscountAmount: number;
  discountAmount: number;
  /** Salon plan id (`membership_plans`) when salon membership wins; null if platform membership or none. */
  membershipPlanId: string | null;
  /** Platform catalog `memberships.id` when platform membership wins; otherwise null. */
  membershipId: string | null;
  membershipDiscountAmount: number;
  loyaltyDiscountAmount: number;
  loyaltyPointsRedeemed: number;
  taxRate: number;
  taxAmount: number;
  serviceFeePercentage: number;
  serviceFeeAmount: number;
  showServiceFeeToCustomer: boolean;
  tipAmount: number;
  totalAmount: number;
  commissionBase: number;
}

export async function computeCustomOfferPricing(
  supabase: SupabaseClient,
  input: CustomOfferPricingInput
): Promise<{ ok: true; result: CustomOfferPricingResult } | { ok: false; error: string }> {
  const {
    offerPrice,
    travelFee,
    currency: _currency,
    providerId,
    customerId,
    tenantId,
    supabaseAdmin,
    tipAmount: inputTip = 0,
    promotionCode = null,
    locationType = "at_salon",
    locationId = null,
    loyaltyPointsRequested: loyaltyPointsRequestedRaw = 0,
  } = input;

  const loyaltyPointsRequested = Math.max(0, Math.floor(Number(loyaltyPointsRequestedRaw) || 0));

  const subtotalBeforeDiscount = Math.max(0, offerPrice) + Math.max(0, travelFee);

  // Load provider for tax, tips, fee config, tenant (scoped payouts)
  const { data: provider } = await supabase
    .from("providers")
    .select("tax_rate_percent, tax_inclusive, tips_enabled, customer_fee_config_id, tenant_id")
    .eq("id", providerId)
    .single();

  const tipsEnabled = Boolean((provider as any)?.tips_enabled ?? true);
  const tipAmount = tipsEnabled ? Math.max(0, Number(inputTip) || 0) : 0;

  // Promo + coupons (shared with validate-booking; tenant-scoped promotions)
  let promotionId: string | null = null;
  let promotionDiscountAmount = 0;
  const promoCode = (promotionCode || "").toString().trim().toUpperCase();

  if (promoCode) {
    const promoTenantId =
      ((provider as { tenant_id?: string | null } | null)?.tenant_id as string | undefined) ||
      tenantId ||
      "";
    const promoResolved = await resolveCheckoutPromotionDiscount(supabase, {
      promoCode,
      providerId: providerId || undefined,
      promoTenantId,
      prePromoSubtotal: subtotalBeforeDiscount,
      locationType,
      locationId: locationId ?? null,
    });
    promotionId = promoResolved.promotionId;
    promotionDiscountAmount = promoResolved.promotionDiscountAmount;
  }

  const combinedAfterPromo = Math.max(0, subtotalBeforeDiscount - promotionDiscountAmount);
  const discountAmount = promotionDiscountAmount;

  // Membership discount (same helper / subtotal input as validate-booking)
  const { resolveMembershipDiscount } = await import("@/lib/provider/salon-membership-entitlement");
  const membershipResolved = await resolveMembershipDiscount({
    supabase,
    customerId,
    providerId,
    subtotal: combinedAfterPromo,
  });
  const membershipPlanId = membershipResolved.membershipPlanId;
  const membershipId = membershipResolved.membershipId;
  const membershipDiscountAmount = membershipResolved.membershipDiscountAmount;
  const subtotalAfterMembership = Math.max(0, combinedAfterPromo - membershipDiscountAmount);

  // Loyalty redemption (before tax & platform fee; matches validate-booking)
  let loyaltyDiscountAmount = 0;
  let loyaltyPointsRedeemed = 0;

  if (loyaltyPointsRequested > 0) {
    const { data: loyaltyConfig } = await supabase
      .from("loyalty_point_config")
      .select("redemption_rate, min_redemption_points, max_redemption_percentage, is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!loyaltyConfig) {
      return { ok: false, error: "Loyalty points are currently unavailable." };
    }

    const redemptionRate = Number(loyaltyConfig.redemption_rate) || 10;
    const minPoints = Number(loyaltyConfig.min_redemption_points) || 0;
    const maxPct = Number(loyaltyConfig.max_redemption_percentage) || 100;

    if (loyaltyPointsRequested < minPoints) {
      return { ok: false, error: `You need at least ${minPoints} points to redeem.` };
    }

    const maxDiscount = (subtotalAfterMembership * maxPct) / 100;
    const maxPointsByCap = Math.floor(maxDiscount * redemptionRate);
    const pointsToRedeem = Math.min(loyaltyPointsRequested, maxPointsByCap);

    if (loyaltyPointsRequested > 0 && maxPointsByCap < minPoints) {
      return {
        ok: false,
        error: `This offer only allows up to ${maxPointsByCap} loyalty points (${maxPct}% max), which is below the minimum redemption of ${minPoints} points.`,
      };
    }

    if (pointsToRedeem < minPoints) {
      return {
        ok: false,
        error: `You need at least ${minPoints} points to redeem, but only ${pointsToRedeem} points can be applied on this offer (${maxPct}% maximum).`,
      };
    }

    const { data: ledgerBal } = await supabase.rpc("get_customer_available_points" as any, {
      customer_uuid: customerId,
    });
    const availableBalance = Number(ledgerBal) || 0;

    if (pointsToRedeem > availableBalance) {
      return {
        ok: false,
        error: `You have ${availableBalance} loyalty points available. This redemption needs up to ${pointsToRedeem} points (${maxPct}% max on this offer).`,
      };
    }

    const discount = pointsToRedeem / redemptionRate;
    loyaltyPointsRedeemed = pointsToRedeem;
    loyaltyDiscountAmount = Math.round(discount * 100) / 100;
  }

  const baseAfterLoyalty = Math.max(0, subtotalAfterMembership - loyaltyDiscountAmount);

  // Tax: provider rate or platform default
  const rawProviderTaxRate = (provider as any)?.tax_rate_percent;
  let taxRate: number;
  let taxIncluded = false;
  if (rawProviderTaxRate == null) {
    const defaults = await getPlatformDefaultTaxRateAndInclusive(supabaseAdmin);
    taxRate = defaults.taxRate;
    taxIncluded = defaults.taxIncluded;
  } else {
    taxRate = Math.max(0, Number(rawProviderTaxRate));
    taxIncluded = Boolean((provider as any)?.tax_inclusive ?? false);
  }

  let taxAmount = 0;
  if (taxRate > 0) {
    if (taxIncluded) {
      taxAmount = baseAfterLoyalty - baseAfterLoyalty / (1 + taxRate / 100);
    } else {
      taxAmount = percentOf(baseAfterLoyalty, taxRate);
    }
  }

  // Platform Fee: provider fee config or tenant-scoped platform settings (matches validate-booking)
  let serviceFeeAmount = 0;
  let serviceFeePercentage = 0;
  let serviceFeeConfigId: string | null = null;

  if ((provider as any)?.customer_fee_config_id) {
    const { data: feeConfig } = await supabase
      .from("platform_fee_config")
      .select("id, fee_type, fee_percentage, fee_fixed_amount, min_booking_amount, max_fee_amount")
      .eq("id", (provider as any).customer_fee_config_id)
      .eq("is_active", true)
      .maybeSingle();

    if (feeConfig) {
      serviceFeeConfigId = feeConfig.id;
      const minBookingAmount = Number(feeConfig.min_booking_amount || 0);
      if (baseAfterLoyalty >= minBookingAmount) {
        if (feeConfig.fee_type === "percentage") {
          serviceFeePercentage = Number(feeConfig.fee_percentage || 0);
          serviceFeeAmount = percentOf(baseAfterLoyalty, serviceFeePercentage);
          if (feeConfig.max_fee_amount) {
            serviceFeeAmount = Math.min(serviceFeeAmount, Number(feeConfig.max_fee_amount));
          }
        } else if (feeConfig.fee_type === "fixed_amount") {
          serviceFeeAmount = Number(feeConfig.fee_fixed_amount || 0);
        }
      }
    }
  }

  let showServiceFeeToCustomer = true;
  if (serviceFeeAmount === 0 && !serviceFeeConfigId) {
    const scopedTenantId =
      ((provider as { tenant_id?: string | null } | null)?.tenant_id as string | undefined) || tenantId || "";

    const scopedSettings = await fetchScopedSingle<Record<string, unknown>>({
      supabase: supabaseAdmin,
      table: "platform_settings",
      tenantId: scopedTenantId,
      select: "settings",
      apply: (q: any) => q.eq("is_active", true),
      orderBy: { column: "updated_at", ascending: false },
    });
    const settings = (scopedSettings.data as { settings?: Record<string, unknown> } | null)?.settings;
    const payoutSettings = (settings as Record<string, any> | undefined)?.payouts || {};
    const serviceFeeType = payoutSettings.platform_service_fee_type || "fixed";
    const fallbackFeePercentage = payoutSettings.platform_service_fee_percentage ?? 0;
    const fallbackFeeFixed = payoutSettings.platform_service_fee_fixed ?? 0;

    if (payoutSettings.show_service_fee_to_customer === false) {
      showServiceFeeToCustomer = false;
    }

    if (serviceFeeType === "percentage") {
      serviceFeePercentage = fallbackFeePercentage;
      serviceFeeAmount = percentOf(baseAfterLoyalty, serviceFeePercentage);
    } else {
      serviceFeeAmount = fallbackFeeFixed;
    }
  } else if (serviceFeeConfigId) {
    showServiceFeeToCustomer = true;
  }

  const totalAmount = taxIncluded
    ? sumMoney(baseAfterLoyalty, tipAmount, serviceFeeAmount)
    : sumMoney(baseAfterLoyalty, tipAmount, taxAmount, serviceFeeAmount);

  // Commission base: lines only, no travel — match validate-booking (membership reduces base)
  const prePromoCommissionBase = Math.max(0, offerPrice);
  const commissionBase = Math.max(
    0,
    prePromoCommissionBase - promotionDiscountAmount - membershipDiscountAmount,
  );

  return {
    ok: true,
    result: {
      subtotal: Number(offerPrice),
      travelFee: Number(travelFee),
      promotionId,
      promotionDiscountAmount,
      discountAmount,
      membershipPlanId,
      membershipId,
      membershipDiscountAmount,
      loyaltyDiscountAmount,
      loyaltyPointsRedeemed,
      taxRate,
      taxAmount,
      serviceFeePercentage,
      serviceFeeAmount,
      showServiceFeeToCustomer,
      tipAmount,
      totalAmount,
      commissionBase,
    },
  };
}
