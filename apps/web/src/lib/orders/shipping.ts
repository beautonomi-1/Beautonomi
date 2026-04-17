import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getShippingProvider,
  ShippingProviderNotConfiguredError,
  type ShippingProvider,
  type ShippingProviderId,
  type CreateShipmentRequest,
  type Address,
} from "@beautonomi/shipping";

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

export async function bookShippingForOrder(
  supabase: SupabaseClient,
  orderId: string,
): Promise<BookShippingResult> {
  const { data: order, error } = await supabase
    .from("product_orders")
    .select("id, provider_id, customer_id, shipping_address, status, tracking_number")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return { ok: false, error: error?.message ?? "order_not_found" };
  }
  if (order.tracking_number) {
    return { ok: true, skipped: "already_booked", trackingNumber: order.tracking_number };
  }

  const { data: provider } = await supabase
    .from("providers")
    .select("id, business_name, physical_address, shipping_provider_preference")
    .eq("id", order.provider_id)
    .single();

  const providerPreference = (provider as { shipping_provider_preference?: string | null } | null)
    ?.shipping_provider_preference as ShippingProviderId | null | undefined;

  if (!providerPreference) {
    return { ok: true, skipped: "no_shipping_preference" };
  }

  let courier: ShippingProvider;
  try {
    courier = getShippingProvider(providerPreference);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const origin = toAddress((provider as { physical_address?: unknown })?.physical_address, provider?.business_name ?? "");
  const destination = toAddress(
    (order as { shipping_address?: unknown })?.shipping_address,
    "Customer",
  );

  if (!origin || !destination) {
    return { ok: false, error: "missing_address" };
  }

  const { data: items } = await supabase
    .from("product_order_items")
    .select("quantity, products(weight_g, length_mm, width_mm, height_mm, title)")
    .eq("order_id", orderId);

  const parcels = (items ?? []).map((row: { quantity?: number | null; products?: unknown }) => {
    const p = (row.products as {
      weight_g?: number | null;
      length_mm?: number | null;
      width_mm?: number | null;
      height_mm?: number | null;
      title?: string | null;
    }) ?? {};
    return {
      weightKg: ((p.weight_g ?? 500) / 1000) * Math.max(1, row.quantity ?? 1),
      lengthCm: (p.length_mm ?? 200) / 10,
      widthCm: (p.width_mm ?? 150) / 10,
      heightCm: (p.height_mm ?? 50) / 10,
      description: p.title ?? "Product order",
    };
  });

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
        shipping_provider: shipment.providerId,
        shipping_waybill_url: shipment.waybillUrl ?? null,
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

function toAddress(raw: unknown, fallbackName: string): Address | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const line1 = str(r.line1 ?? r.street ?? r.address1);
  const city = str(r.city ?? r.locality);
  const postal = str(r.postal_code ?? r.postalCode ?? r.zip);
  const country = str(r.country ?? r.country_code ?? "ZA");
  if (!line1 || !city || !postal || !country) return null;
  return {
    name: str(r.name) ?? fallbackName,
    line1,
    line2: str(r.line2 ?? r.address2) ?? undefined,
    city,
    region: str(r.region ?? r.state) ?? undefined,
    postalCode: postal,
    country,
    phone: str(r.phone) ?? undefined,
    email: str(r.email) ?? undefined,
  };
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}
