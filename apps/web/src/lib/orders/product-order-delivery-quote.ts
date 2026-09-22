import type { SupabaseClient } from "@supabase/supabase-js";
import { getMapboxService } from "@/lib/mapbox/mapbox";
import { calculateProductDeliveryFee, distanceKmBetween } from "@/lib/orders/delivery-fee";

export type ProductOrderCartLine = {
  quantity: number;
  product?: {
    retail_price?: string | number;
    weight_grams?: number | string | null;
  } | null;
  product_variant?: {
    retail_price?: string | number;
  } | null;
};

export type DeliveryQuoteResult = {
  fee: number;
  feeType: string;
  distanceKm: number | null;
  radiusKm: number;
  withinRadius: boolean;
  coordsMissing: boolean;
  geocodeAttempted: boolean;
  estimatedDeliveryDays: number | null;
  deliveryNotes: string | null;
};

type AddressRow = {
  id: string;
  user_id: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

async function geocodeAndPersistAddress(
  supabase: SupabaseClient,
  address: AddressRow,
): Promise<{ latitude: number | null; longitude: number | null; geocodeAttempted: boolean }> {
  let lat = Number(address.latitude);
  let lng = Number(address.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { latitude: lat, longitude: lng, geocodeAttempted: false };
  }

  try {
    const mapbox = await getMapboxService();
    const fullAddress = [
      address.address_line1,
      address.address_line2,
      address.city,
      address.state,
      address.postal_code,
      address.country,
    ]
      .filter(Boolean)
      .join(", ");

    const geocodeResults = await mapbox.geocode(fullAddress, {
      country: address.country,
      limit: 1,
    });

    if (geocodeResults.length > 0) {
      lng = geocodeResults[0].center[0];
      lat = geocodeResults[0].center[1];
      await (supabase.from("user_addresses") as any)
        .update({ latitude: lat, longitude: lng })
        .eq("id", address.id)
        .eq("user_id", address.user_id);
      return { latitude: lat, longitude: lng, geocodeAttempted: true };
    }
  } catch (e) {
    console.warn("[product-order-delivery-quote] geocode failed:", e);
  }

  return { latitude: null, longitude: null, geocodeAttempted: true };
}

async function loadDeliveryOrigin(
  supabase: SupabaseClient,
  providerId: string,
): Promise<{ latitude?: number | null; longitude?: number | null } | null> {
  const primaryQuery = (supabase.from("provider_locations") as any)
    .select("latitude, longitude, location_type, is_primary")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  const { data: strictRows, error } = await primaryQuery;
  if (error?.code === "42703") {
    const { data: legacyRows } = await (supabase.from("provider_locations") as any)
      .select("latitude, longitude, is_primary")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    return (legacyRows ?? [])[0] ?? null;
  }

  const rows = strictRows ?? [];
  const salon = rows.find((r: { location_type?: string }) => r.location_type === "salon");
  return salon ?? rows[0] ?? null;
}

export async function computeProductOrderDeliveryQuote(params: {
  supabase: SupabaseClient;
  userId: string;
  providerId: string;
  deliveryAddressId: string;
  cartItems: ProductOrderCartLine[];
}): Promise<
  | { ok: true; quote: DeliveryQuoteResult }
  | { ok: false; code: "ADDRESS_NOT_FOUND" | "DELIVERY_RADIUS_EXCEEDED" | "DELIVERY_ADDRESS_UNVERIFIED" }
> {
  const { supabase, userId, providerId, deliveryAddressId, cartItems } = params;

  const { data: shipConfig } = await (supabase.from("provider_shipping_config") as any)
    .select(
      "delivery_fee, delivery_fee_type, free_delivery_threshold, delivery_radius_km, weight_rate_per_km, distance_rate_per_km, estimated_delivery_days, delivery_notes",
    )
    .eq("provider_id", providerId)
    .maybeSingle();

  const radiusKm = Number(shipConfig?.delivery_radius_km ?? 0) || 0;
  const estimatedDeliveryDays =
    shipConfig?.estimated_delivery_days != null ? Number(shipConfig.estimated_delivery_days) : null;
  const deliveryNotes =
    typeof shipConfig?.delivery_notes === "string" ? shipConfig.delivery_notes : null;

  const { data: addressRow } = await (supabase.from("user_addresses") as any)
    .select(
      "id, user_id, address_line1, address_line2, city, state, postal_code, country, latitude, longitude",
    )
    .eq("id", deliveryAddressId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!addressRow) {
    return { ok: false, code: "ADDRESS_NOT_FOUND" };
  }

  const geo = await geocodeAndPersistAddress(supabase, addressRow as AddressRow);
  const originRow = await loadDeliveryOrigin(supabase, providerId);

  const addressCoords = {
    latitude: geo.latitude,
    longitude: geo.longitude,
  };
  const distanceKm = distanceKmBetween(originRow, addressCoords);
  const coordsMissing = distanceKm == null;

  if (radiusKm > 0 && coordsMissing) {
    return { ok: false, code: "DELIVERY_ADDRESS_UNVERIFIED" };
  }

  if (radiusKm > 0 && distanceKm != null && distanceKm > radiusKm) {
    return { ok: false, code: "DELIVERY_RADIUS_EXCEEDED" };
  }

  const subtotalCalc = cartItems.reduce((sum, ci) => {
    const price = ci.product_variant
      ? parseFloat(String(ci.product_variant.retail_price))
      : parseFloat(String(ci.product?.retail_price ?? 0));
    return sum + (Number.isFinite(price) ? price : 0) * ci.quantity;
  }, 0);

  const delivery = calculateProductDeliveryFee({
    subtotal: subtotalCalc,
    config: shipConfig,
    distanceKm,
    items: cartItems.map((ci) => ({
      quantity: ci.quantity,
      weight_grams: ci.product?.weight_grams,
    })),
  });

  return {
    ok: true,
    quote: {
      fee: delivery.fee,
      feeType: delivery.feeType,
      distanceKm,
      radiusKm,
      withinRadius: radiusKm <= 0 || (distanceKm != null && distanceKm <= radiusKm),
      coordsMissing,
      geocodeAttempted: geo.geocodeAttempted,
      estimatedDeliveryDays,
      deliveryNotes,
    },
  };
}

export async function validateCollectionLocationForProvider(
  supabase: SupabaseClient,
  providerId: string,
  collectionLocationId: string,
): Promise<boolean> {
  const primaryQuery = (supabase.from("provider_locations") as any)
    .select("id, provider_id, is_active, location_type")
    .eq("id", collectionLocationId)
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .maybeSingle();

  const { data, error } = await primaryQuery;
  if (error?.code === "42703") {
    const { data: legacy } = await (supabase.from("provider_locations") as any)
      .select("id, provider_id, is_active")
      .eq("id", collectionLocationId)
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .maybeSingle();
    return Boolean(legacy);
  }

  if (!data) return false;
  const loc = data as { location_type?: string };
  if (loc.location_type != null && loc.location_type !== "salon") return false;
  return true;
}
