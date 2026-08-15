import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getShippingProvider,
  ShippingProviderNotConfiguredError,
  type ShippingProvider,
  type ShippingProviderId,
  type CreateShipmentRequest,
  type Address,
  type RateQuote,
  type TrackingUpdate,
  type ShippingRuntimeCredentials,
} from "@beautonomi/shipping";
import { loadEcommerceShippingRuntime } from "@/lib/orders/shipping-secrets";

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

export async function bookShippingForOrder(
  supabase: SupabaseClient,
  orderId: string,
): Promise<BookShippingResult> {
  const { data: order, error } = await supabase
    .from("product_orders")
    .select(`
      id,
      provider_id,
      customer_id,
      fulfillment_type,
      status,
      tracking_number,
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
        country
      )
    `)
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return { ok: false, error: error?.message ?? "order_not_found" };
  }
  if (order.tracking_number) {
    return { ok: true, skipped: "already_booked", trackingNumber: order.tracking_number };
  }

  if ((order as { fulfillment_type?: string | null }).fulfillment_type !== "delivery") {
    return { ok: true, skipped: "not_delivery_order" };
  }

  // Ops gate: live courier booking stays off until superadmin enables it with keys
  // (Integrations → Courier shipping) or ECOMMERCE_SHIPPING_ENABLED=true.
  const runtime = await loadEcommerceShippingRuntime(supabase);
  if (!runtime.enabled) {
    return { ok: true, skipped: "shipping_globally_disabled" };
  }

  const { data: shippingConfig } = await supabase
    .from("provider_shipping_config")
    .select("shipping_provider_preference")
    .eq("provider_id", order.provider_id)
    .maybeSingle();

  const providerPreference = (shippingConfig as { shipping_provider_preference?: string | null } | null)
    ?.shipping_provider_preference as ShippingProviderId | null | undefined;

  if (!providerPreference || !isKnownShippingProviderId(providerPreference)) {
    return { ok: true, skipped: "no_shipping_preference" };
  }

  let courier: ShippingProvider;
  try {
    courier = courierFor(providerPreference, runtime.credentials);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const [{ data: provider }, { data: originLocation }] = await Promise.all([
    supabase
      .from("providers")
      .select("id, business_name")
      .eq("id", order.provider_id)
      .single(),
    supabase
      .from("provider_locations")
      .select("name, address_line1, address_line2, city, state, postal_code, country, phone")
      .eq("provider_id", order.provider_id)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const customer = unwrapRow((order as { customer?: unknown }).customer);
  const origin = toShippingAddress(originLocation, provider?.business_name ?? "");
  const destination = toShippingAddress(
    (order as { delivery_address?: unknown })?.delivery_address,
    str(customer?.full_name) ?? "Customer",
    {
      phone: str(customer?.phone) ?? undefined,
      email: str(customer?.email) ?? undefined,
    },
  );

  if (!origin || !destination) {
    return { ok: false, error: "missing_address" };
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
  };

  try {
    const shipment = await courier.createShipment(req);
    await (supabase.from("product_orders") as unknown as {
      update: (v: Record<string, unknown>) => { eq: (k: string, v: string) => Promise<unknown> };
    })
      .update({
        tracking_number: shipment.trackingNumber,
        carrier: shipment.providerId,
        tracking_url: shipment.waybillUrl ?? null,
      })
      .eq("id", order.id);

    return {
      ok: true,
      providerId: shipment.providerId,
      trackingNumber: shipment.trackingNumber,
    };
  } catch (err) {
    if (err instanceof ShippingProviderNotConfiguredError) {
      return { ok: true, skipped: `provider_not_configured:${err.providerId}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function refreshTrackingForOrder(
  supabase: SupabaseClient,
  orderId: string,
  opts?: { providerId?: string; customerId?: string },
): Promise<RefreshTrackingResult> {
  let query = supabase
    .from("product_orders")
    .select("id, provider_id, customer_id, tracking_number, carrier, tracking_url")
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
    const runtime = await loadEcommerceShippingRuntime(supabase);
    const events = await courierFor(carrier, runtime.credentials).track(trackingNumber);
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
): Promise<{
  ok: boolean;
  quotes: RateQuote[];
  providerId?: ShippingProviderId;
  skipped?: string;
  error?: string;
}> {
  const runtime = await loadEcommerceShippingRuntime(supabase);
  if (!runtime.enabled) {
    return { ok: true, quotes: [], skipped: "shipping_globally_disabled" };
  }

  const [{ data: shippingConfig }, { data: provider }, { data: originLocation }] = await Promise.all([
    supabase
      .from("provider_shipping_config")
      .select("shipping_provider_preference")
      .eq("provider_id", providerId)
      .maybeSingle(),
    supabase.from("providers").select("id, business_name").eq("id", providerId).maybeSingle(),
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

  const preference = (shippingConfig as { shipping_provider_preference?: string | null } | null)
    ?.shipping_provider_preference;
  if (!isKnownShippingProviderId(preference)) {
    return { ok: true, quotes: [], skipped: "no_shipping_preference" };
  }

  const origin = toShippingAddress(originLocation, provider?.business_name ?? "");
  if (!origin) {
    return { ok: false, quotes: [], error: "missing_origin_address", providerId: preference };
  }

  try {
    const quotes = await courierFor(preference, runtime.credentials).quoteRates({
      origin,
      destination,
      parcels: [defaultParcel()],
    });
    return { ok: true, quotes, providerId: preference };
  } catch (err) {
    if (err instanceof ShippingProviderNotConfiguredError) {
      return { ok: true, quotes: [], skipped: `provider_not_configured:${err.providerId}`, providerId: preference };
    }
    return { ok: false, quotes: [], error: err instanceof Error ? err.message : String(err), providerId: preference };
  }
}

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
  return {
    name: str(row.name ?? row.label ?? row.company) ?? fallbackName,
    line1,
    line2: str(row.address_line2 ?? row.line2 ?? row.address2) ?? undefined,
    city,
    region: str(row.region ?? row.state) ?? undefined,
    postalCode: postal,
    country,
    phone: contact?.phone ?? str(row.phone) ?? undefined,
    email: contact?.email ?? str(row.email) ?? undefined,
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
