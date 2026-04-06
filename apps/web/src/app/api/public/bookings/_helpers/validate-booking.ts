import { SupabaseClient } from "@supabase/supabase-js";
import type { PublicBookingValidatedBody } from "@/lib/public-booking/booking-draft-schema";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getTravelBuffer } from "@/lib/config/house-call-config";
import { handleApiError } from "@/lib/supabase/api-helpers";
import { ensureProviderFreeSubscriptionRow } from "@/lib/subscriptions/ensure-provider-free-subscription";
import { checkBookingLimit } from "@/lib/subscriptions/limit-checker";
import { formatPublicCustomerBookingLimitMessage } from "@/lib/subscriptions/subscription-limit-messages";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import type { BookingDraft } from "@/types/beautonomi";
import { percentOf, sumMoney, roundCurrency } from "@beautonomi/utils";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ValidatedBookingData {
  customerId: string;
  provider: ProviderRow;
  currency: string;

  /** Maps offering id → offering row */
  offeringById: Map<string, any>;
  /** Maps addon id → addon row */
  addonById: Map<string, any>;
  /** Maps product id → product row */
  productById: Map<string, any>;

  servicesSubtotal: number;
  addonsSubtotal: number;
  productsSubtotal: number;
  travelFee: number;
  packageDiscountAmount: number;
  promoDiscountAmount: number;
  promotionId: string | null;
  promoCode: string;
  subtotal: number;

  membershipPlanId: string | null;
  membershipDiscountAmount: number;
  subtotalAfterMembership: number;
  commissionBase: number;

  tipAmount: number;
  taxRate: number;
  taxAmount: number;

  serviceFeeAmount: number;
  serviceFeePercentage: number;
  serviceFeeConfigId: string | null;

  totalAmount: number;
  loyaltyPointsEarned: number;

  /** Appointment status determined by provider settings */
  appointmentStatus: string;

  /** Conflict-check results */
  allowOverride: boolean;
  conflictResult: ConflictResult | null;

  /** Resource IDs required across all services */
  allResourceIds: string[];

  /** Pre-built booking_services rows + total duration */
  bookingServicesData: any[];
  totalDuration: number;
  bookingEnd: Date;
  selectedDatetime: Date;

  /** Group booking data */
  isGroupBooking: boolean;
  groupParticipants: any[] | null;
}

export interface ProviderRow {
  id: string;
  tenant_id?: string | null;
  currency: string | null;
  requires_deposit: boolean;
  deposit_percentage: number | null;
  status: string;
  tax_rate_percent: number | null;
  tips_enabled: boolean | null;
  customer_fee_config_id: string | null;
  minimum_mobile_booking_amount: number | null;
}

export interface ConflictResult {
  hasConflict?: boolean;
  conflictingBookings?: Array<{ booking_id: string }>;
}

// ─── Main validation function ─────────────────────────────────────────────────

/**
 * Validate and enrich a booking draft.
 *
 * Returns either a `ValidatedBookingData` object (on success)
 * or a NextResponse error (if any check fails). The caller should
 * check `response instanceof Response` to know which it got.
 */
export async function validateBooking(
  supabase: SupabaseClient,
  supabaseAdmin: SupabaseClient,
  draft: BookingDraft,
  validatedDraft: PublicBookingValidatedBody,
  userId: string,
  /** When set (public web bookings), provider must belong to this tenant */
  marketTenantId?: string,
  /** e.g. on-demand accept creates an immediate booking — skip provider min-notice lead time */
  options?: { skipMinNoticeCheck?: boolean }
): Promise<ValidatedBookingData | Response> {
  // ── Auth / user row ──────────────────────────────────────────────────────
  const { data: userRow, error: userRowError } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .single();

  if (userRowError || !userRow) {
    return handleApiError(
      new Error("User profile not found"),
      "User profile not found",
      "NOT_FOUND",
      404
    );
  }

  const customerId = userRow.id as string;

  // ── Location validation ──────────────────────────────────────────────────
  if (draft.location_type === "at_salon" && !draft.location_id) {
    return handleApiError(
      new Error("location_id is required for at_salon bookings"),
      "location_id is required for at_salon bookings",
      "VALIDATION_ERROR",
      400
    );
  }
  if (draft.location_type === "at_salon" && draft.location_id) {
    const { data: loc } = await supabase
      .from("provider_locations")
      .select("id, location_type")
      .eq("id", draft.location_id)
      .eq("provider_id", draft.provider_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!loc) {
      return handleApiError(
        new Error("Selected location is not available"),
        "Selected location is not available",
        "VALIDATION_ERROR",
        400
      );
    }
    if ((loc as any).location_type === "base") {
      return handleApiError(
        new Error("This provider does not accept in-studio bookings at this location"),
        "This location is for distance reference only; please book at home.",
        "VALIDATION_ERROR",
        400
      );
    }
  }
  if (draft.location_type === "at_home" && !draft.address) {
    return handleApiError(
      new Error("address is required for at_home bookings"),
      "address is required for at_home bookings",
      "VALIDATION_ERROR",
      400
    );
  }

  // ── Provider ─────────────────────────────────────────────────────────────
  let providerQuery = supabase
    .from("providers")
    .select(
      "id, tenant_id, currency, requires_deposit, deposit_percentage, status, tax_rate_percent, tips_enabled, customer_fee_config_id, minimum_mobile_booking_amount"
    )
    .eq("id", draft.provider_id);
  if (marketTenantId) {
    providerQuery = providerQuery.eq("tenant_id", marketTenantId);
  }
  const { data: provider, error: providerError } = await providerQuery.single();

  if (providerError || !provider) {
    return handleApiError(new Error("Provider not found"), "Provider not found", "NOT_FOUND", 404);
  }

  if (provider.status !== "active") {
    return handleApiError(
      new Error("Provider is not available"),
      "Provider is not available",
      "PROVIDER_INACTIVE",
      400
    );
  }

  const tenantIdForCurrency = provider.tenant_id || marketTenantId || null;
  const tenantRegionConfig = tenantIdForCurrency
    ? await getTenantRegionConfig(tenantIdForCurrency)
    : null;

  // Ensure an explicit free subscription row when missing so limit RPCs resolve a plan (local/stale DBs).
  await ensureProviderFreeSubscriptionRow(
    supabaseAdmin,
    provider.id,
    provider.tenant_id ?? marketTenantId ?? null
  );

  // ── Subscription limit ───────────────────────────────────────────────────
  const bookingLimitCheck = await checkBookingLimit(provider.id);
  if (!bookingLimitCheck.canProceed) {
    const publicMessage = formatPublicCustomerBookingLimitMessage(bookingLimitCheck);
    console.error("[validateBooking] booking limit denied for provider", provider.id, {
      internalReason: bookingLimitCheck.reason,
      planName: bookingLimitCheck.planName,
      currentCount: bookingLimitCheck.currentCount,
      limitValue: bookingLimitCheck.limitValue,
    });
    return handleApiError(
      new Error(`Booking limit: ${bookingLimitCheck.reason}`),
      publicMessage,
      "SUBSCRIPTION_LIMIT_EXCEEDED",
      403
    );
  }

  // ── Minimum notice (lead time) from provider_online_booking_settings ─────
  // Applies to scheduled online bookings (at_salon and at_home). Not separate per location type in DB today.
  if (!options?.skipMinNoticeCheck) {
    const { data: obSettings } = await supabaseAdmin
      .from("provider_online_booking_settings")
      .select("min_notice_minutes")
      .eq("provider_id", draft.provider_id)
      .maybeSingle();
    const raw = obSettings?.min_notice_minutes;
    const minNotice =
      typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : 60;
    const effectiveMinNotice = Number.isFinite(minNotice) && minNotice >= 0 ? minNotice : 60;
    if (effectiveMinNotice > 0) {
      const selected = new Date(draft.selected_datetime);
      if (!Number.isFinite(selected.getTime())) {
        return handleApiError(
          new Error("Invalid selected_datetime"),
          "Invalid appointment time.",
          "VALIDATION_ERROR",
          400
        );
      }
      const cutoffMs = Date.now() + effectiveMinNotice * 60 * 1000;
      if (selected.getTime() < cutoffMs) {
        return handleApiError(
          new Error("Minimum notice not met for booking time"),
          `This provider requires at least ${effectiveMinNotice} minutes' notice. Please choose a later time.`,
          "MIN_NOTICE_NOT_MET",
          400
        );
      }
    }
  }

  // ── Offerings ────────────────────────────────────────────────────────────
  let offeringIds = draft.services.map((s) => s.offering_id);
  const isGroupBookingDraft =
    Boolean(validatedDraft.is_group_booking) && Array.isArray(validatedDraft.group_participants) && validatedDraft.group_participants.length > 0;
  if (isGroupBookingDraft) {
    const groupIds = (validatedDraft.group_participants as any[]).flatMap(
      (p: any) => p.service_ids ?? p.serviceIds ?? []
    );
    offeringIds = [...new Set([...offeringIds, ...groupIds])];
  }
  const { data: offerings, error: offeringsError } = await supabase
    .from("offerings")
    .select(
      "id, provider_id, title, duration_minutes, buffer_minutes, price, currency, supports_at_home, at_home_price_adjustment, is_active"
    )
    .in("id", offeringIds);

  if (offeringsError) throw offeringsError;

  const offeringById = new Map<string, any>();
  for (const o of offerings || []) offeringById.set(o.id, o);

  for (const s of draft.services) {
    const off = offeringById.get(s.offering_id);
    if (!off || off.provider_id !== draft.provider_id || !off.is_active) {
      return handleApiError(
        new Error("Invalid service selection"),
        "Invalid service selection",
        "VALIDATION_ERROR",
        400
      );
    }
    if (draft.location_type === "at_home" && off.supports_at_home === false) {
      return handleApiError(
        new Error("One or more services do not support at-home"),
        "At-home not supported",
        "VALIDATION_ERROR",
        400
      );
    }
  }

  // Validate group participants' offerings (same provider, active)
  if (isGroupBookingDraft) {
    for (const p of validatedDraft.group_participants as any[]) {
      const ids = p.service_ids ?? p.serviceIds ?? [];
      for (const id of ids) {
        const off = offeringById.get(id);
        if (!off || off.provider_id !== draft.provider_id || !off.is_active) {
          return handleApiError(
            new Error("Invalid service selection for group participant"),
            "Invalid service selection",
            "VALIDATION_ERROR",
            400
          );
        }
      }
    }
  }

  // ── Addons ───────────────────────────────────────────────────────────────
  const addonIds = draft.addons || [];
  const addonById = new Map<string, any>();
  if (addonIds.length > 0) {
    const { data: addons, error: addonsError } = await supabase
      .from("service_addons")
      .select("id, provider_id, price, currency, is_active")
      .in("id", addonIds);
    if (addonsError) throw addonsError;
    for (const a of addons || []) addonById.set(a.id, a);
    for (const id of addonIds) {
      const a = addonById.get(id);
      if (!a || a.provider_id !== draft.provider_id || !a.is_active) {
        return handleApiError(
          new Error("Invalid add-on selection"),
          "Invalid add-on selection",
          "VALIDATION_ERROR",
          400
        );
      }
    }
    // Branch: at_salon with location_id — addon must be available at that location
    if (draft.location_type === "at_salon" && draft.location_id) {
      const { data: addonLocs } = await supabase
        .from("addon_locations")
        .select("addon_id")
        .in("addon_id", addonIds);
      const addonsWithRestriction = new Set((addonLocs ?? []).map((r: any) => r.addon_id));
      const { data: atLocation } = await supabase
        .from("addon_locations")
        .select("addon_id")
        .in("addon_id", addonIds)
        .eq("location_id", draft.location_id);
      const addonIdsAtLocation = new Set((atLocation ?? []).map((r: any) => r.addon_id));
      for (const id of addonIds) {
        if (addonsWithRestriction.has(id) && !addonIdsAtLocation.has(id)) {
          return handleApiError(
            new Error("One or more add-ons are not available at the selected location"),
            "Add-on not available at this location",
            "VALIDATION_ERROR",
            400
          );
        }
      }
    }
  }

  // ── Products (server-authoritative price + stock — do not trust client unit/total) ──
  const currency = provider.currency || tenantRegionConfig?.defaultCurrency || LAST_RESORT_CURRENCY;
  const products = draft.products ?? [];
  const productById = new Map<string, any>();
  const variantById = new Map<string, any>();
  let productsSubtotal = 0;

  if (products.length > 0) {
    const productIds = products
      .map((p) => p.productId ?? p.product_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (productIds.length !== products.length) {
      return handleApiError(
        new Error("Each product line must include a valid product id"),
        "Each product line must include a valid product id",
        "VALIDATION_ERROR",
        400
      );
    }

    const variantIds = products
      .map((p) => {
        const row = p as { productVariantId?: string | null; product_variant_id?: string | null };
        return row.productVariantId ?? row.product_variant_id ?? null;
      })
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    const { data: productRows, error: productsError } = await supabase
      .from("products")
      .select(
        "id, provider_id, name, retail_price, currency, is_active, retail_sales_enabled, track_stock_quantity, quantity, has_variants"
      )
      .in("id", productIds);

    if (productsError) throw productsError;

    for (const p of productRows || []) productById.set(p.id, p);

    if (variantIds.length > 0) {
      const { data: variantRows, error: variantError } = await supabase
        .from("product_variants")
        .select("id, product_id, retail_price, quantity")
        .in("id", variantIds);
      if (variantError) throw variantError;
      for (const v of variantRows || []) variantById.set(v.id, v);
    }

    for (const product of products) {
      const pid = product.productId ?? product.product_id;
      const productData = productById.get(pid);
      if (!productData || productData.provider_id !== draft.provider_id || !productData.is_active) {
        return handleApiError(
          new Error("Invalid product selection"),
          "Invalid product selection",
          "VALIDATION_ERROR",
          400
        );
      }
      if (productData.retail_sales_enabled === false) {
        return handleApiError(
          new Error(`Product is not available for purchase: ${productData.name}`),
          "Product is not available for purchase",
          "VALIDATION_ERROR",
          400
        );
      }

      const row = product as { productVariantId?: string | null; product_variant_id?: string | null };
      const variantId = row.productVariantId ?? row.product_variant_id ?? null;

      const qtyRaw = Number(product.quantity);
      const qty = Math.max(1, Math.floor(qtyRaw));
      if (!Number.isFinite(qtyRaw) || qty < 1 || qty > 10_000) {
        return handleApiError(new Error("Invalid quantity"), "Invalid quantity", "VALIDATION_ERROR", 400);
      }

      let unitPrice: number;

      if (productData.has_variants === true) {
        if (!variantId) {
          return handleApiError(
            new Error(`Select a variant for ${productData.name}`),
            "Variant is required for this product",
            "VALIDATION_ERROR",
            400
          );
        }
        const vrow = variantById.get(variantId);
        if (!vrow || vrow.product_id !== pid) {
          return handleApiError(
            new Error("Invalid product variant"),
            "Invalid product variant",
            "VALIDATION_ERROR",
            400
          );
        }
        unitPrice = Number(vrow.retail_price);
        const vQty = Number(vrow.quantity ?? 0);
        if (qty > vQty) {
          return handleApiError(
            new Error(`Insufficient stock for ${productData.name}`),
            `Only ${vQty} units available`,
            "INSUFFICIENT_STOCK",
            400
          );
        }
        row.productVariantId = variantId;
      } else {
        if (variantId) {
          return handleApiError(
            new Error("This product does not use variants"),
            "Invalid product variant for this product",
            "VALIDATION_ERROR",
            400
          );
        }
        unitPrice = Number(productData.retail_price ?? 0);
        if (productData.track_stock_quantity && qty > (productData.quantity || 0)) {
          return handleApiError(
            new Error(`Insufficient stock for ${productData.name}`),
            `Only ${productData.quantity || 0} units available for ${productData.name}`,
            "INSUFFICIENT_STOCK",
            400
          );
        }
        row.productVariantId = null;
      }

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return handleApiError(new Error("Invalid product price"), "Invalid product price", "VALIDATION_ERROR", 400);
      }

      const lineTotal = unitPrice * qty;
      (product as { unitPrice?: number; totalPrice?: number }).unitPrice = unitPrice;
      (product as { unitPrice?: number; totalPrice?: number }).totalPrice = lineTotal;
      productsSubtotal += lineTotal;
    }
  }

  // ── Price calculations ───────────────────────────────────────────────────
  const servicesSubtotal = draft.services.reduce((sum, s) => {
    const off = offeringById.get(s.offering_id);
    const base = Number(off.price || 0);
    const homeAdj = draft.location_type === "at_home" ? Number(off.at_home_price_adjustment || 0) : 0;
    return sum + base + homeAdj;
  }, 0);

  const addonsSubtotal = addonIds.reduce(
    (sum, id) => sum + Number(addonById.get(id)?.price || 0),
    0
  );

  const travelFee = draft.location_type === "at_home" ? (draft.travel_fee || 0) : 0;

  // ── Package discount ─────────────────────────────────────────────────────
  let packageDiscountAmount = 0;
  if (draft.package_id) {
    const { data: pkg, error: pkgError } = await supabase
      .from("service_packages")
      .select("id, provider_id, price, currency, discount_percentage")
      .eq("id", draft.package_id)
      .single();
    if (pkgError || !pkg || pkg.provider_id !== draft.provider_id) {
      return handleApiError(
        new Error("Invalid package selection"),
        "Invalid package selection",
        "VALIDATION_ERROR",
        400
      );
    }
    // Branch: at_salon with location_id — package must be available at that location
    if (draft.location_type === "at_salon" && draft.location_id) {
      const { data: allPkgLocs } = await supabase
        .from("package_locations")
        .select("location_id")
        .eq("package_id", draft.package_id);
      if (allPkgLocs && allPkgLocs.length > 0) {
        const allowedLocationIds = new Set(allPkgLocs.map((r: any) => r.location_id));
        if (!allowedLocationIds.has(draft.location_id)) {
          return handleApiError(
            new Error("This package is not available at the selected location"),
            "Package not available at this location",
            "VALIDATION_ERROR",
            400
          );
        }
      }
    }
    if (pkg.price !== null && pkg.price !== undefined) {
      packageDiscountAmount = Math.max(0, servicesSubtotal - Number(pkg.price));
    } else if (pkg.discount_percentage) {
      packageDiscountAmount = Math.max(0, percentOf(servicesSubtotal, Number(pkg.discount_percentage)));
    }
  }

  // ── Promo code ───────────────────────────────────────────────────────────
  let promotionId: string | null = null;
  let promoDiscountAmount = 0;
  const promoCode = (validatedDraft.promotion_code || "").toString().trim().toUpperCase();
  const prePromoSubtotal =
    Math.max(0, servicesSubtotal - packageDiscountAmount) + addonsSubtotal + productsSubtotal + travelFee;

  if (promoCode) {
    const providerId = draft.provider_id as string | undefined;
    const selectCols =
      "id, code, type, value, min_purchase_amount, max_discount_amount, valid_from, valid_until, usage_limit, usage_count, is_active, location_id, provider_id, applicable_providers";

    // Prefer provider-scoped promo, then platform (provider_id null)
    let promo: any = null;
    if (providerId) {
      const { data: providerPromo } = await (supabase.from("promotions") as any)
        .select(selectCols)
        .eq("code", promoCode)
        .eq("provider_id", providerId)
        .maybeSingle();
      promo = providerPromo;
    }
    if (!promo) {
      const { data: platformPromo } = await (supabase.from("promotions") as any)
        .select(selectCols)
        .eq("code", promoCode)
        .is("provider_id", null)
        .maybeSingle();
      promo = platformPromo;
    }

    if (promo) {
      // Platform promos with applicable_providers: only valid for those providers
      const applicableProviders = (promo.applicable_providers as string[] | null) || [];
      const providerOk =
        promo.provider_id != null ||
        applicableProviders.length === 0 ||
        (providerId != null && applicableProviders.includes(providerId));

      const now = new Date();
      const validFrom = promo.valid_from ? new Date(promo.valid_from) : null;
      const validUntil = promo.valid_until ? new Date(promo.valid_until) : null;

      const withinWindow = (!validFrom || now >= validFrom) && (!validUntil || now <= validUntil);
      const underLimit = promo.usage_limit == null || (promo.usage_count || 0) < promo.usage_limit;
      const meetsMin = !promo.min_purchase_amount || prePromoSubtotal >= Number(promo.min_purchase_amount);
      const locationOk =
        promo.location_id == null ||
        (draft.location_type === "at_salon" && draft.location_id === promo.location_id);

      if (promo.is_active && providerOk && withinWindow && underLimit && meetsMin && locationOk) {
        if (promo.type === "percentage")
          promoDiscountAmount = percentOf(prePromoSubtotal, Number(promo.value || 0));
        else promoDiscountAmount = Number(promo.value || 0);

        if (promo.max_discount_amount)
          promoDiscountAmount = Math.min(promoDiscountAmount, Number(promo.max_discount_amount));
        promoDiscountAmount = Math.max(0, Math.min(promoDiscountAmount, prePromoSubtotal));
        promotionId = promo.id;
      }
    }
  }

  const subtotal = Math.max(0, prePromoSubtotal - promoDiscountAmount);

  // ── Minimum mobile booking amount ────────────────────────────────────────
  if (draft.location_type === "at_home" && provider.minimum_mobile_booking_amount) {
    const minimumAmount = Number(provider.minimum_mobile_booking_amount);
    if (minimumAmount > 0 && subtotal < minimumAmount) {
      return handleApiError(
        new Error(`Minimum order amount for house calls is ${minimumAmount.toFixed(2)} ${currency}`),
        `Minimum order amount for house calls is ${minimumAmount.toFixed(2)} ${currency}. Your current order is ${subtotal.toFixed(2)} ${currency}. Please add more services or book at the salon instead.`,
        "MINIMUM_ORDER_NOT_MET",
        400
      );
    }
  }

  // ── Commission base ──────────────────────────────────────────────────────
  const commissionBaseBeforeMembership =
    Math.max(0, servicesSubtotal - packageDiscountAmount) + addonsSubtotal + productsSubtotal - promoDiscountAmount;

  // ── Membership discount ──────────────────────────────────────────────────
  let membershipPlanId: string | null = null;
  let membershipDiscountAmount = 0;
  try {
    const { data: membership } = await (supabase.from("user_memberships") as any)
      .select("status, expires_at, plan:membership_plans(id, provider_id, discount_percent, is_active)")
      .eq("user_id", customerId)
      .eq("provider_id", draft.provider_id)
      .maybeSingle();

    const isExpired = membership?.expires_at ? new Date(membership.expires_at) < new Date() : false;
    const active = membership?.status === "active" && !isExpired && membership?.plan?.is_active !== false;

    if (active) {
      membershipPlanId = membership.plan?.id || null;
      const pct = Number(membership.plan?.discount_percent || 0);
      if (pct > 0) {
        membershipDiscountAmount = Math.max(0, percentOf(subtotal, pct));
        membershipDiscountAmount = Math.min(membershipDiscountAmount, subtotal);
      }
    }
  } catch {
    // ignore – membership tables may not exist in some dev envs
  }

  const subtotalAfterMembership = Math.max(0, subtotal - membershipDiscountAmount);
  const commissionBase = Math.max(0, commissionBaseBeforeMembership - membershipDiscountAmount);

  // ── Tips / Tax ───────────────────────────────────────────────────────────
  const tipsEnabled = Boolean((provider as any)?.tips_enabled ?? true);
  const tipAmount = tipsEnabled ? (draft.tip_amount || 0) : 0;

  let taxRate = Number((provider as any)?.tax_rate_percent || 0);
  if (taxRate === 0) {
    const { getPlatformDefaultTaxRate } = await import("@/lib/platform-tax-settings");
    taxRate = await getPlatformDefaultTaxRate();
  }
  const taxAmount = taxRate > 0 ? percentOf(subtotalAfterMembership, taxRate) : 0;

  // ── Service fee ──────────────────────────────────────────────────────────
  let serviceFeeAmount = 0;
  let serviceFeePercentage = 0;
  let serviceFeeConfigId: string | null = null;

  if ((provider as any)?.customer_fee_config_id) {
    const { data: feeConfig } = await supabase
      .from("platform_fee_config")
      .select("id, fee_type, fee_percentage, fee_fixed_amount, min_booking_amount, max_fee_amount")
      .eq("id", (provider as any).customer_fee_config_id)
      .eq("is_active", true)
      .single();

    if (feeConfig) {
      serviceFeeConfigId = feeConfig.id;
      const minBookingAmount = Number(feeConfig.min_booking_amount || 0);

      if (subtotalAfterMembership >= minBookingAmount) {
        if (feeConfig.fee_type === "percentage") {
          serviceFeePercentage = Number(feeConfig.fee_percentage || 0);
          serviceFeeAmount = percentOf(subtotalAfterMembership, serviceFeePercentage);
          if (feeConfig.max_fee_amount) {
            serviceFeeAmount = Math.min(serviceFeeAmount, Number(feeConfig.max_fee_amount));
          }
        } else if (feeConfig.fee_type === "fixed_amount") {
          serviceFeeAmount = Number(feeConfig.fee_fixed_amount || 0);
        }
      }
    }
  }

  // Fallback to platform settings if no provider fee config
  if (serviceFeeAmount === 0 && !serviceFeeConfigId) {
    const scopedSettings = await fetchScopedSingle<Record<string, unknown>>({
      supabase: supabaseAdmin,
      table: "platform_settings",
      tenantId: provider.tenant_id || marketTenantId || "",
      select: "settings",
      apply: (q) => q.eq("is_active", true),
      orderBy: { column: "updated_at", ascending: false },
    });
    const settings = (scopedSettings.data as { settings?: Record<string, unknown> } | null)?.settings;
    const payoutSettings = (settings as Record<string, any> | undefined)?.payouts || {};
    const serviceFeeType = payoutSettings.platform_service_fee_type || "percentage";
    const fallbackFeePercentage = payoutSettings.platform_service_fee_percentage || 0;
    const fallbackFeeFixed = payoutSettings.platform_service_fee_fixed || 0;

    if (serviceFeeType === "percentage") {
      serviceFeePercentage = fallbackFeePercentage;
      serviceFeeAmount = percentOf(subtotalAfterMembership, serviceFeePercentage);
    } else {
      serviceFeeAmount = fallbackFeeFixed;
    }
  }

  const totalAmount = sumMoney(subtotalAfterMembership, tipAmount, taxAmount, serviceFeeAmount);

  // ── Loyalty points ───────────────────────────────────────────────────────
  let loyaltyPointsEarned = 0;
  const { data: loyaltyRule } = await supabase
    .from("loyalty_rules")
    .select("points_per_currency_unit, currency")
    .eq("is_active", true)
    .eq("currency", currency)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (loyaltyRule?.points_per_currency_unit) {
    loyaltyPointsEarned = Math.floor(totalAmount * Number(loyaltyRule.points_per_currency_unit));
  }

  // ── Appointment status ───────────────────────────────────────────────────
  const { determineAppointmentStatusFromDB } = await import(
    "@/lib/provider-portal/appointment-settings"
  );
  const appointmentStatus = await determineAppointmentStatusFromDB(supabaseAdmin, draft.provider_id);

  // ── Group booking duration (for conflict check) ─────────────────────────
  const isGroupBooking =
    Boolean(validatedDraft.is_group_booking) && Boolean(validatedDraft.group_participants);
  const groupParticipants = isGroupBooking ? validatedDraft.group_participants : null;
  let groupTotalDurationMinutes: number | null = null;
  if (isGroupBooking && groupParticipants && groupParticipants.length > 0) {
    const { calculateGroupBookingDuration } = await import(
      "@/lib/bookings/group-booking-services"
    );
    const durationMap = new Map<string, { duration_minutes: number }>();
    for (const o of offeringById.values()) {
      durationMap.set(o.id, { duration_minutes: Number(o.duration_minutes || 0) });
    }
    const primaryServiceIds = (draft.services || []).map((s: any) => s.offering_id);
    const allParticipantsForDuration = [
      { serviceIds: primaryServiceIds },
      ...(groupParticipants as any[]).map((p: any) => ({
        serviceIds: p.service_ids ?? p.serviceIds ?? [],
      })),
    ];
    groupTotalDurationMinutes = calculateGroupBookingDuration(allParticipantsForDuration, durationMap);
  }

  // ── Time-slot conflict check ─────────────────────────────────────────────
  const firstService = draft.services[0];
  let allowOverride = false;
  let conflictResult: ConflictResult | null = null;
  /** When completing a Mangomint-style hold, RPC conflict window must match hold.end_at (not recomputed duration). */
  let holdReservedEndAt: Date | null = null;

  if (validatedDraft.hold_id) {
    const { data: holdRow } = await supabaseAdmin
      .from("booking_holds")
      .select("end_at, hold_status, provider_id")
      .eq("id", validatedDraft.hold_id)
      .maybeSingle();
    if (!holdRow || holdRow.hold_status !== "active") {
      return handleApiError(
        new Error("Booking hold is no longer valid"),
        "Your hold has expired or was already used. Please select a new time.",
        "HOLD_INVALID",
        410
      );
    }
    if (holdRow.provider_id !== draft.provider_id) {
      return handleApiError(
        new Error("Hold does not match provider"),
        "This booking session is no longer valid. Please start again.",
        "VALIDATION_ERROR",
        400
      );
    }
    holdReservedEndAt = new Date(holdRow.end_at as string);
  }

  if (firstService.staff_id) {
    const selectedDatetime = new Date(draft.selected_datetime);

    let bookingEndForConflict: Date;

    // Active hold: same window as above (single fetch for all hold flows, including post–random-staff assignment).
    if (validatedDraft.hold_id && holdReservedEndAt) {
      bookingEndForConflict = holdReservedEndAt;
    } else {
      let checkDuration = 0;
      if (groupTotalDurationMinutes != null) {
        checkDuration = groupTotalDurationMinutes;
        const lastPrimaryOffering = offeringById.get(draft.services[draft.services.length - 1].offering_id);
        checkDuration += Number(lastPrimaryOffering?.buffer_minutes || 0);
        checkDuration += Number(lastPrimaryOffering?.processing_minutes || 0);
        checkDuration += Number(lastPrimaryOffering?.finishing_minutes || 0);
      } else {
        for (const s of draft.services) {
          const off = offeringById.get(s.offering_id);
          checkDuration += Number(off.duration_minutes || 0);
          checkDuration += Number(off.buffer_minutes || 0);
          checkDuration += Number(off.processing_minutes || 0);
          checkDuration += Number(off.finishing_minutes || 0);
        }
      }

      // Mobile slot grid uses `duration + travelBuffer` (see /api/availability + calculate-slots).
      // Do not use chain-from-previous-address drive time here — it never matched the UI and caused false 409s.
      if (draft.location_type === "at_home" && draft.address?.latitude && draft.address?.longitude) {
        const raw = validatedDraft.availability_travel_buffer_minutes;
        const slotTravelBuffer =
          typeof raw === "number" && Number.isFinite(raw)
            ? Math.min(360, Math.max(0, Math.round(raw)))
            : getTravelBuffer("mobile", undefined);
        checkDuration += slotTravelBuffer;
      }

      bookingEndForConflict = new Date(selectedDatetime.getTime() + checkDuration * 60000);
    }

    const { lockBookingServices, canOverrideDoubleBooking, checkActiveHoldOverlap } = await import(
      "@/lib/bookings/conflict-check"
    );

    // Holds reserve the window in DB but are not on booking_services — block 409 if another guest holds this slot.
    if (!validatedDraft.hold_id) {
      const { normalizePublicStaffIdForDatabase } = await import("@beautonomi/utils");
      const { dbStaffId } = normalizePublicStaffIdForDatabase(firstService.staff_id as string);
      const holdOverlap = await checkActiveHoldOverlap(
        supabaseAdmin,
        draft.provider_id,
        selectedDatetime,
        bookingEndForConflict,
        { dbStaffId: dbStaffId ?? null }
      );
      if (holdOverlap) {
        return handleApiError(
          new Error("This time slot is no longer available. Please select another time."),
          "This time slot is no longer available. Please select another time.",
          "CONFLICT",
          409
        );
      }
    }

    // checkDuration already includes trailing buffer after the last service; lockBookingServices()
    // would add buffer again — that double-count blocked the next slot (false 409).
    // For hold-based requests, end_at is already the full reserved window.
    conflictResult = await lockBookingServices(
      supabase,
      firstService.staff_id,
      selectedDatetime,
      bookingEndForConflict,
      0
    );

    if (conflictResult.hasConflict) {
      allowOverride = await canOverrideDoubleBooking(supabase, draft.provider_id);

      if (!allowOverride) {
        return handleApiError(
          new Error("This time slot is no longer available. Please select another time."),
          "This time slot is no longer available. Please select another time.",
          "CONFLICT",
          409
        );
      }
      console.warn("Double booking override allowed for provider:", draft.provider_id);
    }
  }

  // ── Resource availability ────────────────────────────────────────────────
  const { getRequiredResourcesForOffering, checkResourceAvailability } = await import(
    "@/lib/resources/assignment"
  );
  let allResourceIds: string[] = [];

  const draftResourceIds = draft.resource_ids;
  if (Array.isArray(draftResourceIds) && draftResourceIds.length > 0) {
    allResourceIds = draftResourceIds;
  } else {
    const resourceResults = await Promise.all(
      draft.services.map((s: any) => getRequiredResourcesForOffering(supabase, s.offering_id))
    );
    const resourceIdSet = new Set<string>();
    for (const requiredResources of resourceResults) {
      for (const rid of requiredResources) {
        resourceIdSet.add(rid);
      }
    }
    allResourceIds = [...resourceIdSet];
  }

  if (allResourceIds.length > 0) {
    const selectedDatetime = new Date(draft.selected_datetime);
    let resDuration = 0;
    for (const s of draft.services) {
      const off = offeringById.get(s.offering_id);
      resDuration += Number(off.duration_minutes || 0);
    }
    const resEnd = new Date(selectedDatetime.getTime() + resDuration * 60000);

    const resourceCheck = await checkResourceAvailability(
      supabase,
      [...new Set(allResourceIds)],
      selectedDatetime,
      resEnd
    );

    if (!resourceCheck.available) {
      return handleApiError(
        new Error("Required resources are not available"),
        `Required resources are not available: ${resourceCheck.conflicts.map((c: any) => c.reason).join(", ")}`,
        "RESOURCE_UNAVAILABLE",
        409
      );
    }
  }

  // ── Build booking_services data ──────────────────────────────────────────
  let bookingServicesData: any[];
  let totalDuration = 0;

  if (isGroupBooking && groupParticipants && groupParticipants.length > 0) {
    const { calculateGroupBookingDuration } = await import(
      "@/lib/bookings/group-booking-services"
    );

    const servicesMap = new Map();
    for (const s of draft.services) {
      const off = offeringById.get(s.offering_id);
      servicesMap.set(s.offering_id, {
        offering_id: off.id,
        staff_id: s.staff_id || null,
        duration_minutes: Number(off.duration_minutes),
        price: Number(off.price),
        currency,
        buffer_minutes: Number(off.buffer_minutes || 0),
      });
    }

    // Primary = booker; their services are draft.services. Others are in group_participants (each with service_ids).
    const primaryServiceIds = (draft.services || []).map((s: any) => s.offering_id);
    const allParticipantsForDuration = [
      { serviceIds: primaryServiceIds },
      ...groupParticipants.map((p: any) => ({ serviceIds: p.service_ids ?? p.serviceIds ?? [] })),
    ];
    totalDuration = calculateGroupBookingDuration(allParticipantsForDuration, servicesMap);

    // Booking services data = primary's services only (one booking row; createGroupBookingServices adds others' services)
    let cursor = new Date(draft.selected_datetime);
    bookingServicesData = primaryServiceIds
      .map((serviceId: string) => {
        const s = draft.services.find((serv: any) => serv.offering_id === serviceId);
        if (!s) return null;
        const off = offeringById.get(s.offering_id);
        const start = new Date(cursor);
        const end = new Date(start.getTime() + Number(off.duration_minutes) * 60000);
        cursor = new Date(end.getTime() + Number(off.buffer_minutes || 0) * 60000);
        return {
          offering_id: off.id,
          staff_id: s.staff_id || null,
          duration_minutes: Number(off.duration_minutes),
          price: Number(off.price),
          currency,
          scheduled_start_at: start.toISOString(),
          scheduled_end_at: end.toISOString(),
        };
      })
      .filter(Boolean) as any[];

    if (bookingServicesData.length === 0 && draft.services.length > 0) {
      const s = draft.services[0];
      const off = offeringById.get(s.offering_id);
      const start = new Date(draft.selected_datetime);
      const end = new Date(start.getTime() + Number(off.duration_minutes) * 60000);
      bookingServicesData = [
        {
          offering_id: off.id,
          staff_id: s.staff_id || null,
          duration_minutes: Number(off.duration_minutes),
          price: Number(off.price),
          currency,
          scheduled_start_at: start.toISOString(),
          scheduled_end_at: end.toISOString(),
        },
      ];
    }
  } else {
    let cursor = new Date(draft.selected_datetime);
    bookingServicesData = draft.services.map((s) => {
      const off = offeringById.get(s.offering_id);
      const start = new Date(cursor);
      const end = new Date(start.getTime() + Number(off.duration_minutes) * 60000);
      cursor = new Date(end.getTime() + Number(off.buffer_minutes || 0) * 60000);
      totalDuration += Number(off.duration_minutes);

      return {
        offering_id: off.id,
        staff_id: s.staff_id || null,
        duration_minutes: Number(off.duration_minutes),
        price: Number(off.price),
        currency,
        scheduled_start_at: start.toISOString(),
        scheduled_end_at: end.toISOString(),
      };
    });

    // When "anyone" / no preference: assign a random available staff so booking appears on calendar
    const allStaffNull = bookingServicesData.every((s: any) => !s.staff_id);
    if (allStaffNull && draft.provider_id) {
      const { data: staffRows } = await supabaseAdmin
        .from("provider_staff")
        .select("id")
        .eq("provider_id", draft.provider_id)
        .eq("is_active", true)
        .limit(10);
      const staffIds = (staffRows || []).map((r: any) => r.id);
      if (staffIds.length > 0) {
        const assignId = staffIds[Math.floor(Math.random() * staffIds.length)];
        bookingServicesData = bookingServicesData.map((s: any) => ({ ...s, staff_id: assignId }));
      }
    }
  }

  // Ensure totalDuration is non-zero
  if (totalDuration === 0) {
    for (const s of draft.services) {
      const off = offeringById.get(s.offering_id);
      totalDuration += Number(off.duration_minutes || 0);
    }
  }

  const selectedDatetime = new Date(draft.selected_datetime);
  // Include last service's buffer so RPC / conflict check use full blocked span (non-hold path only).
  const lastOffering = draft.services.length
    ? offeringById.get(draft.services[draft.services.length - 1].offering_id)
    : null;
  const lastBufferMinutes = Number(lastOffering?.buffer_minutes || 0);
  const bookingEndFromServices = new Date(
    selectedDatetime.getTime() + (totalDuration + lastBufferMinutes) * 60000
  );
  // Hold flow: validate + lock used hold.end_at; create_booking_with_locking must use the same end or we get false 409s
  // after the guest signs in and pays (recomputed duration can extend past the slot grid window).
  const bookingEnd = holdReservedEndAt ?? bookingEndFromServices;

  // ── Provider calendar blocks (time blocks, availability, staff off) ─────
  // Same sources as GET /api/public/providers/[slug]/availability; prevents bypass when draft skipped staff conflict paths.
  const locationIdForCalendar =
    draft.location_type === "at_salon" ? draft.location_id ?? null : null;
  {
    const { isProviderCalendarWindowBlocked } = await import(
      "@/lib/public-booking/provider-calendar-block-overlap"
    );
    for (const line of bookingServicesData) {
      const segStart = new Date(line.scheduled_start_at);
      const segEnd = new Date(line.scheduled_end_at);
      const off = offeringById.get(line.offering_id);
      const buf = Number(off?.buffer_minutes ?? 15);
      const effectiveEnd = new Date(segEnd.getTime() + buf * 60000);
      const cal = await isProviderCalendarWindowBlocked(supabaseAdmin, {
        providerId: draft.provider_id,
        locationId: locationIdForCalendar,
        staffId: line.staff_id ?? null,
        startAt: segStart,
        endAt: effectiveEnd,
      });
      if (cal.blocked) {
        return handleApiError(
          new Error(cal.reason || "This time is blocked on the calendar."),
          "This time slot is no longer available. Please select another time.",
          "CONFLICT",
          409,
        );
      }
    }
  }

  // ── Return enriched data ─────────────────────────────────────────────────
  return {
    customerId,
    provider: provider as any as ProviderRow,
    currency,

    offeringById,
    addonById,
    productById,

    servicesSubtotal,
    addonsSubtotal,
    productsSubtotal,
    travelFee,
    packageDiscountAmount,
    promoDiscountAmount,
    promotionId,
    promoCode,
    subtotal,

    membershipPlanId,
    membershipDiscountAmount,
    subtotalAfterMembership,
    commissionBase,

    tipAmount,
    taxRate,
    taxAmount,

    serviceFeeAmount,
    serviceFeePercentage,
    serviceFeeConfigId,

    totalAmount,
    loyaltyPointsEarned,

    appointmentStatus,

    allowOverride,
    conflictResult,

    allResourceIds,

    bookingServicesData,
    totalDuration,
    bookingEnd,
    selectedDatetime,

    isGroupBooking,
    groupParticipants,
  };
}
