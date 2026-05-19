import type { SupabaseClient } from "@supabase/supabase-js";
import { getEffectiveTaxRate } from "@/lib/platform-tax-settings";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { determineAppointmentStatusFromDB } from "@/lib/provider-portal/appointment-settings";
import { checkBookingConflict, canOverrideDoubleBooking } from "@/lib/bookings/conflict-check";
import { resolveTz, fromBusinessTime } from "@/lib/dates/provider-tz";
import { syncAppointmentProductOrder } from "@/lib/orders/sync-appointment-product-order";

type SeriesRow = {
  id: string;
  provider_id: string;
  customer_id: string | null;
  service_id: string | null;
  staff_id: string | null;
  location_id: string | null;
  metadata?: unknown;
  notes?: string | null;
};

type ServiceLine = { offering_id: string; staff_id?: string | null };
type ProductLine = {
  product_id: string;
  product_variant_id?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
};
type AddonLine = {
  addon_id: string;
  quantity: number;
  price: number;
  currency?: string | null;
};

function toHhMmSs(t: string | null | undefined): string {
  const s = (t || "10:00:00").trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return "10:00:00";
}

function mapPortalStatusToDb(portalStatus: string): string {
  if (portalStatus === "booked") return "confirmed";
  if (portalStatus === "started") return "in_progress";
  return portalStatus;
}

function resolveServiceLines(row: SeriesRow): ServiceLine[] {
  const meta = row.metadata as { services?: ServiceLine[] } | null;
  if (Array.isArray(meta?.services) && meta!.services!.length > 0) {
    return meta!.services!.filter((s) => s?.offering_id);
  }
  if (row.service_id) {
    return [{ offering_id: row.service_id, staff_id: row.staff_id }];
  }
  return [];
}

function resolveProductLines(row: SeriesRow): ProductLine[] {
  const meta = row.metadata as { cart_items?: Array<Record<string, unknown>> } | null;
  if (!Array.isArray(meta?.cart_items)) return [];
  return meta.cart_items
    .filter((item) => item?.type === "product" && typeof item.product_id === "string")
    .map((item) => {
      const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)) || 1);
      const unitPrice = Number(item.unit_price ?? item.unitPrice ?? 0) || 0;
      const totalPrice =
        Number(item.total ?? item.total_price ?? item.totalPrice ?? unitPrice * quantity) || 0;
      return {
        product_id: String(item.product_id),
        product_variant_id:
          typeof item.product_variant_id === "string"
            ? item.product_variant_id
            : typeof item.productVariantId === "string"
              ? item.productVariantId
              : null,
        quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
      };
    });
}

export function resolveAddonLines(row: Pick<SeriesRow, "metadata">): AddonLine[] {
  const meta = row.metadata as {
    addons?: Array<Record<string, unknown>>;
    cart_items?: Array<Record<string, unknown>>;
  } | null;
  const explicitAddons = Array.isArray(meta?.addons) ? meta.addons : [];
  const cartItemAddons = Array.isArray(meta?.cart_items)
    ? meta.cart_items.filter((item) => item?.type === "addon")
    : [];
  const addonRows = explicitAddons.length > 0 ? explicitAddons : cartItemAddons;
  if (addonRows.length === 0) return [];
  return addonRows
    .filter((item) => typeof (item.addon_id ?? item.addonId) === "string")
    .map((item) => {
      const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)) || 1);
      const price = Number(item.price ?? item.unit_price ?? item.total ?? 0) || 0;
      return {
        addon_id: String(item.addon_id ?? item.addonId),
        quantity,
        price,
        currency: typeof item.currency === "string" ? item.currency : null,
      };
    });
}

const BUFFER_MINUTES = 15;

function taxSnapshotForRecurringLine(
  providerId: string,
  providerTaxRatePct: unknown,
  taxRate: number
): Record<string, unknown> {
  return {
    code: "RESOLVED",
    rate: taxRate,
    inclusive: false,
    jurisdiction: null,
    source: providerTaxRatePct != null ? "provider_override" : "platform_default",
    provider_id: providerId,
    resolved_at: new Date().toISOString(),
  };
}

/**
 * Create a single booking (+ booking_services) from a recurring series row. Does not charge payment.
 */
export async function createBookingFromRecurringSeries(
  admin: SupabaseClient,
  row: SeriesRow & {
    location_type?: string | null;
    preferred_time?: string | null;
    start_time?: string | null;
  },
  occurrenceDateYmd: string
): Promise<{ bookingId: string } | { error: string }> {
  if (!row.customer_id) {
    return { error: "missing_customer" };
  }

  const lines = resolveServiceLines(row);
  if (lines.length === 0) {
    return { error: "no_services" };
  }
  const productLines = resolveProductLines(row);
  const addonLines = resolveAddonLines(row);

  const timeStr = toHhMmSs(row.start_time || row.preferred_time);

  const { data: providerRow } = await admin
    .from("providers")
    .select("tenant_id, currency, tax_rate_percent, customer_fee_config_id, timezone")
    .eq("id", row.provider_id)
    .maybeSingle();

  const currency =
    (providerRow as { currency?: string | null } | null)?.currency?.trim() || LAST_RESORT_CURRENCY;

  // Build the scheduled datetime in the provider's business timezone, then convert to UTC.
  // `occurrenceDateYmd` + `timeStr` represent wall-clock values in the salon's local time.
  const providerTz = resolveTz((providerRow as { timezone?: string | null } | null)?.timezone);
  const [hh, mm, ss] = timeStr.split(":").map(Number);
  const [year, month, day] = occurrenceDateYmd.split("-").map(Number);
  const wallClockDate = new Date(year, month - 1, day, hh, mm, ss || 0);
  const scheduledAtLocal = fromBusinessTime(wallClockDate, providerTz);

  const offeringIds = [...new Set(lines.map((l) => l.offering_id))];
  const { data: offerings, error: offErr } = await admin
    .from("offerings")
    .select("id, price, duration_minutes, buffer_minutes, currency")
    .in("id", offeringIds)
    .eq("provider_id", row.provider_id);

  if (offErr || !offerings?.length) {
    return { error: `offerings_load_failed: ${offErr?.message || "none"}` };
  }

  const offeringMap = new Map(offerings.map((o: { id: string }) => [o.id, o]));

  let subtotal = 0;
  for (const line of lines) {
    const o = offeringMap.get(line.offering_id) as { price?: number } | undefined;
    if (!o) return { error: `unknown_offering:${line.offering_id}` };
    subtotal += Number(o.price || 0);
  }
  subtotal += productLines.reduce((sum, p) => sum + Number(p.total_price || 0), 0);
  subtotal += addonLines.reduce(
    (sum, a) => sum + Number(a.price || 0) * Number(a.quantity || 1),
    0
  );

  // Pass provider's tax_rate_percent directly to avoid a second DB lookup.
  // getEffectiveTaxRate treats null as "unset" and falls back to platform default.
  const providerTaxRatePct = (providerRow as any)?.tax_rate_percent ?? null;
  const taxRate = await getEffectiveTaxRate(row.provider_id, providerTaxRatePct);
  const taxAmount = Math.round(subtotal * (Number(taxRate) / 100) * 100) / 100;

  // Platform Fee — mirrors validate-booking.ts priority:
  //   1. Provider customer_fee_config_id  2. platform_settings.payouts fallback
  let serviceFeePercentage = 0;
  let serviceFeeAmount = 0;
  const providerFeeConfigId = (providerRow as any)?.customer_fee_config_id ?? null;
  if (providerFeeConfigId) {
    const { data: feeConfig } = await admin
      .from("platform_fee_config")
      .select("fee_type, fee_percentage, fee_fixed_amount")
      .eq("id", providerFeeConfigId)
      .eq("is_active", true)
      .maybeSingle();
    if (feeConfig) {
      if ((feeConfig as any).fee_type === "percentage") {
        serviceFeePercentage = Number((feeConfig as any).fee_percentage || 0);
        serviceFeeAmount = Math.round(subtotal * (serviceFeePercentage / 100) * 100) / 100;
      } else {
        serviceFeeAmount = Number((feeConfig as any).fee_fixed_amount || 0);
      }
    }
  }
  // Fallback to platform_settings.payouts when no provider override
  if (serviceFeeAmount === 0 && !providerFeeConfigId) {
    const { data: psRow } = await admin
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const payoutSettings = ((psRow as any)?.settings as Record<string, any> | null)?.payouts as
      | Record<string, any>
      | undefined;
    if (payoutSettings) {
      const feeType = (payoutSettings.platform_service_fee_type as string) || "fixed";
      if (feeType === "percentage") {
        serviceFeePercentage = Number(payoutSettings.platform_service_fee_percentage ?? 0);
        serviceFeeAmount = Math.round(subtotal * (serviceFeePercentage / 100) * 100) / 100;
      } else {
        serviceFeeAmount = Number(payoutSettings.platform_service_fee_fixed ?? 0);
      }
    }
  }

  const portalStatus = await determineAppointmentStatusFromDB(admin, row.provider_id);
  const dbStatus = mapPortalStatusToDb(portalStatus);

  let cursor = new Date(scheduledAtLocal);
  const pBookingServices: Record<string, unknown>[] = [];
  for (const line of lines) {
    const o = offeringMap.get(line.offering_id) as {
      duration_minutes?: number;
      buffer_minutes?: number;
      price?: number;
      currency?: string;
    };
    const duration = Number(o.duration_minutes || 60);
    const buffer = Number(o.buffer_minutes || 0);
    const price = Number(o.price || 0);
    const cur = o.currency || currency;
    const start = new Date(cursor);
    const end = new Date(cursor.getTime() + duration * 60 * 1000);
    const staffId = line.staff_id ?? row.staff_id ?? null;
    pBookingServices.push({
      offering_id: line.offering_id,
      staff_id: staffId,
      duration_minutes: duration,
      price,
      currency: cur,
      tax_snapshot: taxSnapshotForRecurringLine(row.provider_id, providerTaxRatePct, taxRate),
      scheduled_start_at: start.toISOString(),
      scheduled_end_at: end.toISOString(),
    });
    cursor = new Date(end.getTime() + buffer * 60 * 1000);
  }

  const primaryStaffId =
    (pBookingServices[0]?.staff_id as string | null | undefined) ?? row.staff_id ?? null;

  const startAt = new Date(pBookingServices[0]!.scheduled_start_at as string);
  const endAt = cursor;

  const allowOverride = await canOverrideDoubleBooking(admin, row.provider_id);
  if (primaryStaffId && !allowOverride) {
    const conflict = await checkBookingConflict(admin, primaryStaffId, startAt, endAt, 0);
    if (conflict.hasConflict) {
      return { error: "slot_conflict" };
    }
  }

  const metaAddr = row.metadata as {
    address?: Record<string, unknown>;
    pricing?: Record<string, unknown>;
    booking_source?: string;
  } | null;
  const addr = metaAddr?.address;
  const locationType = (row.location_type || "at_salon") as string;
  const pricingMeta = metaAddr?.pricing ?? {};
  const bookingSource =
    typeof metaAddr?.booking_source === "string" ? metaAddr.booking_source : "online";
  const { data: previousBookingPricing } =
    Object.keys(pricingMeta).length === 0
      ? await admin
          .from("bookings")
          .select(
            "subtotal, discount_amount, promotion_discount_amount, membership_discount_amount, tax_amount, tax_rate, service_fee_percentage, service_fee_amount, tip_amount, travel_fee, total_amount"
          )
          .eq("recurring_series_id", row.id)
          .order("scheduled_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };
  const pricingSource = {
    ...((previousBookingPricing as Record<string, unknown> | null) ?? {}),
    ...pricingMeta,
  };
  const recurringSubtotal = Math.max(0, Number(pricingSource.subtotal ?? subtotal) || 0);
  const recurringTravelFee = Math.max(0, Number(pricingSource.travel_fee ?? 0) || 0);
  const recurringTipAmount = Math.max(0, Number(pricingSource.tip_amount ?? 0) || 0);
  const recurringDiscountAmount = Math.max(0, Number(pricingSource.discount_amount ?? 0) || 0);
  const recurringPromotionDiscount = Math.max(
    0,
    Number(pricingSource.promotion_discount_amount ?? 0) || 0
  );
  const recurringMembershipDiscount = Math.max(
    0,
    Number(pricingSource.membership_discount_amount ?? 0) || 0
  );
  const recurringServiceFeeAmount = Math.max(
    0,
    Number(pricingSource.service_fee_amount ?? serviceFeeAmount) || 0
  );
  const recurringServiceFeePercentage = Math.max(
    0,
    Number(pricingSource.service_fee_percentage ?? serviceFeePercentage) || 0
  );
  const recurringTaxAmount = Math.max(0, Number(pricingSource.tax_amount ?? taxAmount) || 0);
  const recurringTaxRate = Math.max(0, Number(pricingSource.tax_rate ?? taxRate) || 0);
  const effectiveRecurringTravelFee = locationType === "at_home" ? recurringTravelFee : 0;
  const recurringTotalAmount = Math.max(
    0,
    Number(pricingSource.total_amount ?? 0) ||
      recurringSubtotal -
        recurringDiscountAmount -
        recurringPromotionDiscount -
        recurringMembershipDiscount +
        effectiveRecurringTravelFee +
        recurringTaxAmount +
        recurringServiceFeeAmount +
        recurringTipAmount
  );
  const bookingData: Record<string, unknown> = {
    customer_id: row.customer_id,
    provider_id: row.provider_id,
    /** Links this visit to `recurring_appointments` for list/detail queries (cron + RPC insert). */
    recurring_series_id: row.id,
    tenant_id: (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null,
    booking_number: "",
    scheduled_at: scheduledAtLocal.toISOString(),
    location_type: locationType,
    location_id: row.location_id,
    booking_source: bookingSource,
    address_line1:
      typeof addr === "object" && addr && "line1" in addr
        ? String((addr as { line1?: string }).line1)
        : null,
    address_city:
      typeof addr === "object" && addr && "city" in addr
        ? String((addr as { city?: string }).city)
        : null,
    address_country:
      typeof addr === "object" && addr && "country" in addr
        ? String((addr as { country?: string }).country)
        : null,
    address_postal_code:
      typeof addr === "object" && addr && "postal_code" in addr
        ? String((addr as { postal_code?: string }).postal_code)
        : null,
    address_latitude:
      typeof addr === "object" && addr && "latitude" in addr
        ? Number((addr as { latitude?: number }).latitude)
        : null,
    address_longitude:
      typeof addr === "object" && addr && "longitude" in addr
        ? Number((addr as { longitude?: number }).longitude)
        : null,
    subtotal: recurringSubtotal,
    discount_amount: recurringDiscountAmount,
    promotion_discount_amount: recurringPromotionDiscount,
    membership_discount_amount: recurringMembershipDiscount,
    tax_amount: recurringTaxAmount,
    tax_rate: recurringTaxRate,
    tip_amount: recurringTipAmount,
    total_amount: recurringTotalAmount,
    currency,
    status: dbStatus,
    payment_status: "pending",
    special_requests: row.notes || null,
    loyalty_points_earned: 0,
    travel_fee: effectiveRecurringTravelFee,
    service_fee_percentage: recurringServiceFeePercentage,
    service_fee_amount: recurringServiceFeeAmount,
    service_fee_paid_by: "customer",
  };
  const seriesPaymentMethod = (row as { payment_method?: string | null }).payment_method;
  if (seriesPaymentMethod === "cash") {
    bookingData.payment_provider = "cash";
  } else if (seriesPaymentMethod === "yoco_pos") {
    bookingData.payment_provider = "yoco";
  }
  // Recurring generation creates the appointment, not the money movement.
  // Leave payment pending until Paystack, wallet/gift-card settlement, or a
  // provider mark-paid action records a real booking_payments row. That row is
  // the single source of truth for finance ledger, reports, and payouts.

  const existingOccurrence = await admin
    .from("bookings")
    .select("id")
    .eq("recurring_series_id", row.id)
    .eq("scheduled_at", scheduledAtLocal.toISOString())
    .maybeSingle();
  if (existingOccurrence.error) {
    return { error: `occurrence_lookup_failed: ${existingOccurrence.error.message}` };
  }
  if (existingOccurrence.data?.id) {
    return { bookingId: String(existingOccurrence.data.id) };
  }

  if (primaryStaffId && !allowOverride) {
    const { data: bookingId, error: rpcError } = await admin.rpc("create_booking_with_locking", {
      p_booking_data: bookingData,
      p_booking_services: pBookingServices,
      p_staff_id: primaryStaffId,
      p_start_at: startAt.toISOString(),
      p_end_at: endAt.toISOString(),
      p_entitlement_id: null,
      p_entitlement_customer_id: null,
    });

    if (rpcError) {
      const msg = (rpcError as { message?: string }).message ?? "";
      if (msg.includes("BOOKING_SLOT_CONFLICT")) {
        return { error: "slot_conflict" };
      }
      return { error: msg || "rpc_failed" };
    }
    if (!bookingId) {
      return { error: "rpc_no_id" };
    }

    await admin
      .from("bookings")
      .update({
        booking_source: bookingSource,
        tenant_id: (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null,
        ...(bookingData.payment_provider ? { payment_provider: bookingData.payment_provider } : {}),
      })
      .eq("id", bookingId as string);

    try {
      await insertRecurringBookingProductsAndAudit(
        admin,
        bookingId as string,
        productLines,
        addonLines,
        primaryStaffId,
        row,
        occurrenceDateYmd,
        recurringTotalAmount
      );
    } catch (lineErr) {
      await admin
        .from("bookings")
        .delete()
        .eq("id", bookingId as string);
      return {
        error: lineErr instanceof Error ? lineErr.message : "recurring_products_failed",
      };
    }

    return { bookingId: bookingId as string };
  }

  const { data: inserted, error: bErr } = await admin
    .from("bookings")
    .insert(bookingData)
    .select("id")
    .single();

  if (bErr || !inserted) {
    return { error: bErr?.message || "insert_failed" };
  }

  const bookingId = (inserted as { id: string }).id;

  const bsRows = pBookingServices.map((s) => ({
    booking_id: bookingId,
    offering_id: s.offering_id,
    staff_id: s.staff_id,
    duration_minutes: s.duration_minutes,
    price: s.price,
    currency: s.currency,
    tax_snapshot: s.tax_snapshot,
    scheduled_start_at: s.scheduled_start_at,
    scheduled_end_at: s.scheduled_end_at,
  }));

  const { error: bsErr } = await admin.from("booking_services").insert(bsRows);
  if (bsErr) {
    await admin.from("bookings").delete().eq("id", bookingId);
    return { error: `booking_services_failed: ${bsErr.message}` };
  }

  try {
    await insertRecurringBookingProductsAndAudit(
      admin,
      bookingId,
      productLines,
      addonLines,
      primaryStaffId,
      row,
      occurrenceDateYmd,
      recurringTotalAmount
    );
  } catch (lineErr) {
    await admin.from("bookings").delete().eq("id", bookingId);
    return {
      error: lineErr instanceof Error ? lineErr.message : "recurring_products_failed",
    };
  }

  return { bookingId };
}

async function insertRecurringBookingProductsAndAudit(
  admin: SupabaseClient,
  bookingId: string,
  productLines: ProductLine[],
  addonLines: AddonLine[],
  primaryStaffId: string | null,
  row: SeriesRow,
  occurrenceDateYmd: string,
  totalAmount: number
): Promise<void> {
  if (addonLines.length > 0) {
    const { error } = await admin.from("booking_addons").insert(
      addonLines.map((addon) => ({
        booking_id: bookingId,
        addon_id: addon.addon_id,
        quantity: addon.quantity,
        price: addon.price,
        currency: addon.currency ?? LAST_RESORT_CURRENCY,
      }))
    );
    if (error) {
      console.warn(`Failed to insert recurring booking add-ons for ${bookingId}:`, error);
    }
  }

  if (productLines.length > 0) {
    const { error } = await admin.from("booking_products").insert(
      productLines.map((product) => ({
        booking_id: bookingId,
        product_id: product.product_id,
        product_variant_id: product.product_variant_id ?? null,
        quantity: product.quantity,
        unit_price: product.unit_price,
        total_price: product.total_price,
        staff_id: primaryStaffId,
      }))
    );
    if (error) {
      throw new Error(`recurring_booking_products_failed: ${error.message}`);
    } else {
      await syncAppointmentProductOrder(admin, bookingId);
    }
  }

  const { error: eventError } = await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "recurring_occurrence_created",
    event_data: {
      recurring_series_id: row.id,
      occurrence_date: occurrenceDateYmd,
      payment_status: "pending",
      payment_collection: "not_collected_by_recurring_generator",
      preferred_payment_method: (row as { payment_method?: string | null }).payment_method ?? null,
      total_amount: totalAmount,
    },
  });
  if (eventError) {
    console.warn(`Failed to insert recurring booking audit event for ${bookingId}:`, eventError);
  }
}
