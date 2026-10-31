import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BobGoRatesPendingError,
  getShippingProvider,
  isBobGoDomesticCountry,
  ShippingProviderNotConfiguredError,
  type ShippingProvider,
  type ShippingProviderId,
  type CreateShipmentRequest,
  type Address,
  type RateQuote,
  type TrackingUpdate,
  type ShippingRuntimeCredentials,
} from "@beautonomi/shipping";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  isLiveCourierBookingEnabled,
  isShippingKillSwitchActive,
  resolveProviderOwnedCredentials,
  resolveTrackingCredentials,
} from "@/lib/orders/shipping-runtime";

/**
 * F28 — Thin adapter around @beautonomi/shipping that knows how to load an
 * order + provider preference from Supabase, pick the right courier, create
 * the shipment, and persist the tracking number back onto the order.
 *
 * Errors are intentionally non-fatal: if a provider isn't configured we log
 * and continue so an order isn't stuck pending a courier integration rollout.
 */
export interface BookShippingResult {
  ok: boolean;
  providerId?: ShippingProviderId;
  trackingNumber?: string;
  skipped?: string;
  error?: string;
}

export interface RefreshTrackingResult {
  ok: boolean;
  trackingNumber?: string | null;
  carrier?: string | null;
  trackingUrl?: string | null;
  live: boolean;
  events: TrackingUpdate[];
  skipped?: string;
  error?: string;
}

const KNOWN_COURIERS: ShippingProviderId[] = ["aramex", "courier-guy", "bob-go"];

export function isKnownShippingProviderId(value: string | null | undefined): value is ShippingProviderId {
  return !!value && KNOWN_COURIERS.includes(value as ShippingProviderId);
}

function courierFor(id: ShippingProviderId, credentials: ShippingRuntimeCredentials): ShippingProvider {
  return getShippingProvider(id, credentials);
}

const BOOKING_CLAIM_STALE_MS = 10 * 60 * 1000;

async function tryClaimShippingBooking(admin: SupabaseClient, orderId: string): Promise<boolean> {
  const selectClaimed = () =>
    (admin.from("product_orders") as any)
      .update({ shipping_booking_status: "booking", shipping_booking_detail: null })
      .eq("id", orderId)
      .is("tracking_number", null)
      .select("id");

  const { data: fresh } = await selectClaimed().or(
    "shipping_booking_status.is.null,shipping_booking_status.eq.failed,shipping_booking_status.eq.skipped",
  );
  if (fresh?.length) return true;

  const staleBefore = new Date(Date.now() - BOOKING_CLAIM_STALE_MS).toISOString();
  const { data: reclaimed } = await selectClaimed()
    .eq("shipping_booking_status", "booking")
    .lt("updated_at", staleBefore);
  return (reclaimed?.length ?? 0) > 0;
}

async function persistBookingSkip(
  admin: SupabaseClient,
  orderId: string,
  skipped: string,
): Promise<BookShippingResult> {
  await (admin.from("product_orders") as any)
    .update({ shipping_booking_status: "skipped", shipping_booking_detail: skipped })
    .eq("id", orderId);
  return { ok: true, skipped };
}

export type BookShippingForOrderOptions = { bobGoRatesTimeoutMs?: number };

export async function bookShippingForOrder(
  supabase: SupabaseClient,
  orderId: string,
  options?: BookShippingForOrderOptions,
): Promise<BookShippingResult> {
  const admin = getSupabaseAdmin();

  const { data: order, error } = await supabase
    .from("product_orders")
    .select(`
      id,
      provider_id,
      customer_id,
      fulfillment_type,
      status,
      tracking_number,
      shipping_booking_status,
      delivery_instructions,
      customer:users!product_orders_customer_id_fkey (
        full_name,
        email,
        phone
      ),
      delivery_address:user_addresses (
        label,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country,
        latitude,
        longitude
      )
    `)
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return { ok: false, error: error?.message ?? "order_not_found" };
  }
  const existingBookingStatus = (order as { shipping_booking_status?: string | null }).shipping_booking_status;
  if (existingBookingStatus === "submitting" || existingBookingStatus === "booked") {
    return {
      ok: true,
      skipped: "already_booked",
      trackingNumber: (order as { tracking_number?: string | null }).tracking_number ?? undefined,
    };
  }
  if (order.tracking_number) {
    if (existingBookingStatus !== "failed" && existingBookingStatus !== "skipped") {
      return { ok: true, skipped: "already_booked", trackingNumber: order.tracking_number };
    }
  }

  if ((order as { fulfillment_type?: string | null }).fulfillment_type !== "delivery") {
    return persistBookingSkip(admin, orderId, "not_delivery_order");
  }

  if (isShippingKillSwitchActive()) {
    return persistBookingSkip(admin, orderId, "shipping_globally_disabled");
  }

  if (!(await isLiveCourierBookingEnabled(admin))) {
    return persistBookingSkip(admin, orderId, "live_booking_disabled");
  }

  const { data: shippingConfig } = await supabase
    .from("provider_shipping_config")
    .select("shipping_provider_preference")
    .eq("provider_id", order.provider_id)
    .maybeSingle();

  const providerPreference = (shippingConfig as { shipping_provider_preference?: string | null } | null)
    ?.shipping_provider_preference as ShippingProviderId | null | undefined;

  if (!providerPreference || !isKnownShippingProviderId(providerPreference)) {
    return persistBookingSkip(admin, orderId, "no_shipping_preference");
  }

  const runtimeCredentials = await resolveProviderOwnedCredentials(
    admin,
    order.provider_id,
    providerPreference,
  );
  if (!runtimeCredentials) {
    return persistBookingSkip(admin, orderId, `provider_not_configured:${providerPreference}`);
  }

  const claimed = await tryClaimShippingBooking(admin, orderId);
  if (!claimed) {
    return { ok: true, skipped: "booking_in_progress" };
  }

  let courier: ShippingProvider;
  try {
    courier = courierFor(providerPreference, runtimeCredentials);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await (admin.from("product_orders") as any)
      .update({ shipping_booking_status: "failed", shipping_booking_detail: msg })
      .eq("id", orderId);
    return { ok: false, error: msg };
  }

  const [{ data: provider }, { data: originLocation }] = await Promise.all([
    supabase
      .from("providers")
      .select("id, business_name, email, phone")
      .eq("id", order.provider_id)
      .single(),
    supabase
      .from("provider_locations")
      .select("name, address_line1, address_line2, city, state, postal_code, country, phone, latitude, longitude")
      .eq("provider_id", order.provider_id)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const customer = unwrapRow((order as { customer?: unknown }).customer);
  const origin = toShippingAddress(originLocation, provider?.business_name ?? "", {
    phone: str(originLocation?.phone) ?? str(provider?.phone) ?? undefined,
    email: str(provider?.email) ?? undefined,
  });
  const destination = toShippingAddress(
    (order as { delivery_address?: unknown })?.delivery_address,
    str(customer?.full_name) ?? "Customer",
    {
      phone: str(customer?.phone) ?? undefined,
      email: str(customer?.email) ?? undefined,
    },
  );

  if (!origin || !destination) {
    await (admin.from("product_orders") as any)
      .update({ shipping_booking_status: "failed", shipping_booking_detail: "missing_address" })
      .eq("id", orderId);
    return { ok: false, error: "missing_address" };
  }

  if (
    providerPreference === "bob-go" &&
    (!isBobGoDomesticCountry(origin.country) || !isBobGoDomesticCountry(destination.country))
  ) {
    await (admin.from("product_orders") as any)
      .update({
        shipping_booking_status: "failed",
        shipping_booking_detail: "bob_go_domestic_only",
      })
      .eq("id", orderId);
    return { ok: false, error: "bob_go_domestic_only" };
  }

  const { data: items } = await supabase
    .from("product_order_items")
    .select("quantity, total_price, product_name, products(weight_grams, name)")
    .eq("order_id", orderId);

  const parcels = parcelsFromItems(items);

  const req: CreateShipmentRequest = {
    origin,
    destination,
    parcels,
    orderRef: order.id,
    instructionsDelivery: str((order as { delivery_instructions?: unknown }).delivery_instructions) ?? undefined,
    ...(providerPreference === "bob-go"
      ? { ratesTimeoutMs: options?.bobGoRatesTimeoutMs ?? 15_000 }
      : {}),
  };

  try {
    const shipment = await courier.createShipment(req);
    const shipmentIdRaw = shipment.metadata?.shipment_id;
    const shipmentId =
      shipmentIdRaw == null
        ? null
        : typeof shipmentIdRaw === "string"
          ? shipmentIdRaw
          : String(shipmentIdRaw);
    const submissionStatus = String(shipment.metadata?.submission_status ?? "").toLowerCase();
    const trackingUrl =
      typeof shipment.metadata?.tracking_url === "string"
        ? shipment.metadata.tracking_url
        : shipment.waybillUrl ?? null;

    const isBobGoSubmissionFailed =
      providerPreference === "bob-go" &&
      (submissionStatus === "no-rates" ||
        submissionStatus === "failed-indefinitely" ||
        shipment.metadata?.failed === true);

    const isBobGoInFlight =
      providerPreference === "bob-go" &&
      !isBobGoSubmissionFailed &&
      (submissionStatus === "pending-rates" ||
        submissionStatus === "pending-submission" ||
        submissionStatus === "failed-will-retry" ||
        shipment.metadata?.inFlight === true);

    const failedDetail =
      isBobGoSubmissionFailed
        ? String(
            shipment.metadata?.failed_reason ??
              submissionStatus ??
              "bob_go_submission_failed",
          ).slice(0, 500)
        : null;

    const bookingStatus = isBobGoSubmissionFailed
      ? "failed"
      : providerPreference === "bob-go" && isBobGoInFlight
        ? "submitting"
        : submissionStatus === "success" || providerPreference !== "bob-go"
          ? "booked"
          : "submitting";

    const labelUrl =
      providerPreference === "bob-go"
        ? null
        : (typeof shipment.metadata?.label_url === "string" ? shipment.metadata.label_url : null) ??
          shipment.waybillUrl ??
          null;

    await (admin.from("product_orders") as any)
      .update({
        tracking_number: shipment.trackingNumber || null,
        carrier: shipment.providerId,
        tracking_url: trackingUrl,
        courier_shipment_id: shipmentId,
        courier_label_url: labelUrl,
        shipping_booking_status: bookingStatus,
        shipping_booking_detail: failedDetail,
      })
      .eq("id", order.id);

    if (isBobGoSubmissionFailed) {
      const cancelResult = await cancelCourierShipmentForOrder(admin, order.id, {
        markBookingCancelled: false,
      });
      if (cancelResult.ok) {
        await (admin.from("product_orders") as any)
          .update({
            tracking_number: null,
            courier_shipment_id: null,
            tracking_url: null,
            shipping_booking_status: "failed",
            shipping_booking_detail: failedDetail,
          })
          .eq("id", order.id);
      }
      return { ok: false, error: failedDetail ?? "bob_go_submission_failed" };
    }

    return {
      ok: true,
      providerId: shipment.providerId,
      trackingNumber: shipment.trackingNumber,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof ShippingProviderNotConfiguredError) {
      return persistBookingSkip(admin, orderId, `provider_not_configured:${err.providerId}`);
    }
    if (err instanceof BobGoRatesPendingError) {
      await (admin.from("product_orders") as any)
        .update({
          shipping_booking_status: "skipped",
          shipping_booking_detail: "rates_pending",
        })
        .eq("id", orderId);
      return { ok: true, skipped: "rates_pending" };
    }
    if (providerPreference === "bob-go") {
      await (admin.from("product_orders") as any)
        .update({ shipping_booking_status: "failed", shipping_booking_detail: msg.slice(0, 500) })
        .eq("id", orderId);
      return { ok: false, error: msg };
    }
    await (admin.from("product_orders") as any)
      .update({ shipping_booking_status: "failed", shipping_booking_detail: msg.slice(0, 500) })
      .eq("id", orderId);
    return { ok: false, error: msg };
  }
}

export async function refreshTrackingForOrder(
  supabase: SupabaseClient,
  orderId: string,
  opts?: { providerId?: string; customerId?: string },
): Promise<RefreshTrackingResult> {
  let query = supabase
    .from("product_orders")
    .select("id, provider_id, customer_id, tracking_number, carrier, tracking_url, shipping_booking_status")
    .eq("id", orderId);
  if (opts?.providerId) query = query.eq("provider_id", opts.providerId);
  if (opts?.customerId) query = query.eq("customer_id", opts.customerId);

  const { data: order, error } = await query.maybeSingle();
  if (error || !order) {
    return { ok: false, live: false, events: [], error: error?.message ?? "order_not_found" };
  }

  const trackingNumber = (order as { tracking_number?: string | null }).tracking_number ?? null;
  const carrier = (order as { carrier?: string | null }).carrier ?? null;
  const trackingUrl = (order as { tracking_url?: string | null }).tracking_url ?? null;
  if (!trackingNumber) {
    return { ok: true, live: false, events: [], skipped: "no_tracking_number", trackingNumber, carrier, trackingUrl };
  }

  const bookingStatus = (order as { shipping_booking_status?: string | null }).shipping_booking_status;
  if (carrier === "bob-go" && bookingStatus === "submitting") {
    return {
      ok: true,
      live: false,
      events: [],
      skipped: "bob_go_submitting",
      trackingNumber,
      carrier,
      trackingUrl,
    };
  }

  if (!isKnownShippingProviderId(carrier)) {
    return {
      ok: true,
      live: false,
      events: [],
      skipped: "manual_tracking",
      trackingNumber,
      carrier,
      trackingUrl,
    };
  }

  try {
    const providerId = (order as { provider_id?: string }).provider_id;
    const credentials =
      providerId && isKnownShippingProviderId(carrier)
        ? await resolveTrackingCredentials(getSupabaseAdmin(), providerId, carrier)
        : null;
    if (!credentials) {
      return {
        ok: true,
        live: false,
        events: [],
        skipped: `provider_not_configured:${carrier}`,
        trackingNumber,
        carrier,
        trackingUrl,
      };
    }
    const events = await courierFor(carrier, credentials).track(trackingNumber);
    return {
      ok: true,
      live: true,
      events,
      trackingNumber,
      carrier,
      trackingUrl,
    };
  } catch (err) {
    if (err instanceof ShippingProviderNotConfiguredError) {
      return {
        ok: true,
        live: false,
        events: [],
        skipped: `provider_not_configured:${err.providerId}`,
        trackingNumber,
        carrier,
        trackingUrl,
      };
    }
    return {
      ok: false,
      live: false,
      events: [],
      error: err instanceof Error ? err.message : String(err),
      trackingNumber,
      carrier,
      trackingUrl,
    };
  }
}

export async function quoteRatesForProvider(
  supabase: SupabaseClient,
  providerId: string,
  destination: Address,
  options?: { preferenceOverride?: ShippingProviderId },
): Promise<{
  ok: boolean;
  quotes: RateQuote[];
  providerId?: ShippingProviderId;
  skipped?: string;
  error?: string;
}> {
  if (isShippingKillSwitchActive()) {
    return { ok: true, quotes: [], skipped: "shipping_globally_disabled" };
  }

  const admin = getSupabaseAdmin();

  const [{ data: shippingConfig }, { data: provider }, { data: originLocation }] = await Promise.all([
    supabase
      .from("provider_shipping_config")
      .select("shipping_provider_preference")
      .eq("provider_id", providerId)
      .maybeSingle(),
    supabase.from("providers").select("id, business_name, email, phone").eq("id", providerId).maybeSingle(),
    supabase
      .from("provider_locations")
      .select("name, address_line1, address_line2, city, state, postal_code, country, phone")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const preference =
    options?.preferenceOverride ??
    (shippingConfig as { shipping_provider_preference?: string | null } | null)
      ?.shipping_provider_preference;
  if (!isKnownShippingProviderId(preference)) {
    return { ok: true, quotes: [], skipped: "no_shipping_preference" };
  }

  const origin = toShippingAddress(originLocation, provider?.business_name ?? "", {
    phone: str(originLocation?.phone) ?? str(provider?.phone) ?? undefined,
    email: str(provider?.email) ?? undefined,
  });
  if (!origin) {
    return { ok: false, quotes: [], error: "missing_origin_address", providerId: preference };
  }

  const runtimeCredentials = await resolveProviderOwnedCredentials(admin, providerId, preference);
  if (!runtimeCredentials) {
    return { ok: true, quotes: [], skipped: `provider_not_configured:${preference}`, providerId: preference };
  }

  try {
    const quotes = await courierFor(preference, runtimeCredentials).quoteRates({
      origin,
      destination,
      parcels: [defaultParcel()],
      ...(preference === "bob-go" ? { ratesTimeoutMs: BOB_GO_PROBE_RATES_TIMEOUT_MS } : {}),
    });
    return { ok: true, quotes, providerId: preference };
  } catch (err) {
    if (err instanceof ShippingProviderNotConfiguredError) {
      return { ok: true, quotes: [], skipped: `provider_not_configured:${err.providerId}`, providerId: preference };
    }
    return { ok: false, quotes: [], error: err instanceof Error ? err.message : String(err), providerId: preference };
  }
}

export async function cancelCourierShipmentForOrder(
  supabase: SupabaseClient,
  orderId: string,
  opts?: { markBookingCancelled?: boolean },
): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const { data: order } = await supabase
    .from("product_orders")
    .select("id, provider_id, carrier, courier_shipment_id, tracking_number")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "order_not_found" };
  const carrier = (order as { carrier?: string | null }).carrier;
  if (!isKnownShippingProviderId(carrier)) {
    return { ok: true, skipped: "manual_tracking" };
  }
  const admin = getSupabaseAdmin();
  const creds = await resolveProviderOwnedCredentials(
    admin,
    (order as { provider_id: string }).provider_id,
    carrier,
  );
  if (!creds) return { ok: true, skipped: "provider_not_configured" };
  const result = await courierFor(carrier, creds).cancelShipment({
    shipmentId: (order as { courier_shipment_id?: string | null }).courier_shipment_id,
    trackingNumber: (order as { tracking_number?: string | null }).tracking_number,
  });
  if (result.ok === false) {
    return { ok: false, error: result.message ?? result.reason };
  }
  if (opts?.markBookingCancelled !== false) {
    await (admin.from("product_orders") as any)
      .update({ shipping_booking_status: "cancelled" })
      .eq("id", orderId);
  }
  return { ok: true };
}

/** Bob Go quote probe / credential test — full rates wait. */
export const BOB_GO_PROBE_RATES_TIMEOUT_MS = 25_000;

export function toShippingAddress(
  raw: unknown,
  fallbackName: string,
  contact?: { phone?: string; email?: string },
): Address | null {
  const row = unwrapRow(raw);
  if (!row) return null;
  const line1 = str(row.address_line1 ?? row.line1 ?? row.street ?? row.address1);
  const city = str(row.city ?? row.locality);
  const postal = str(row.postal_code ?? row.postalCode ?? row.zip);
  const country = str(row.country ?? row.country_code) ?? "ZA";
  if (!line1 || !city || !postal || !country) return null;
  const suburbHint = str(row.suburb ?? row.neighborhood ?? row.local_area);
  const line2FromRow = str(row.address_line2 ?? row.line2 ?? row.address2);
  const line2 =
    line2FromRow ??
    (suburbHint && suburbHint.toLowerCase() !== city.toLowerCase() ? suburbHint : undefined);
  const latRaw = row.latitude ?? row.lat;
  const lngRaw = row.longitude ?? row.lng;
  const latitude = latRaw != null && Number.isFinite(Number(latRaw)) ? Number(latRaw) : undefined;
  const longitude = lngRaw != null && Number.isFinite(Number(lngRaw)) ? Number(lngRaw) : undefined;
  return {
    name: str(row.name ?? row.label ?? row.company) ?? fallbackName,
    line1,
    line2,
    city,
    region: str(row.region ?? row.state) ?? undefined,
    postalCode: postal,
    country,
    phone: contact?.phone ?? str(row.phone) ?? undefined,
    email: contact?.email ?? str(row.email) ?? undefined,
    latitude,
    longitude,
  };
}

function parcelsFromItems(items: unknown): CreateShipmentRequest["parcels"] {
  const rows = Array.isArray(items) ? items : [];
  const parcels = rows.map((row) => {
    const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const product = unwrapRow(rec.products) ?? {};
    const qty = Math.max(1, Number(rec.quantity ?? 1) || 1);
    const grams = Number((product as { weight_grams?: number | null }).weight_grams ?? 500);
    return {
      weightKg: (Number.isFinite(grams) && grams > 0 ? grams : 500) / 1000 * qty,
      lengthCm: 20,
      widthCm: 15,
      heightCm: 5,
      declaredValue: Number(rec.total_price ?? 0) || undefined,
      description:
        str((product as { name?: unknown }).name) ??
        str(rec.product_name) ??
        "Product order",
    };
  });
  return parcels.length > 0 ? parcels : [defaultParcel()];
}

function defaultParcel() {
  return {
    weightKg: 0.5,
    lengthCm: 20,
    widthCm: 15,
    heightCm: 5,
    description: "Parcel",
  };
}

function unwrapRow(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  return typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}
