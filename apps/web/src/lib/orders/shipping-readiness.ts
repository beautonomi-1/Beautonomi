import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShippingProviderId } from "@beautonomi/shipping";
import {
  loadProviderCourierCredentialsRow,
  publicCourierCredentialsStatus,
} from "@/lib/orders/provider-shipping-credentials";
import {
  isLiveCourierBookingEnabled,
  isShippingKillSwitchActive,
} from "@/lib/orders/shipping-runtime";

export type ShippingReadinessItem = {
  id: string;
  ok: boolean;
  message: string;
};

export type ShippingReadinessResult = {
  readyForDeliveryCheckout: boolean;
  readyForCourierBooking: boolean;
  items: ShippingReadinessItem[];
};

type ShippingConfigRow = {
  offers_delivery?: boolean;
  offers_collection?: boolean;
  shipping_provider_preference?: ShippingProviderId | null;
};

export async function computeShippingReadiness(
  admin: SupabaseClient,
  providerId: string,
  config: ShippingConfigRow,
): Promise<ShippingReadinessResult> {
  const items: ShippingReadinessItem[] = [];
  const offersDelivery = Boolean(config.offers_delivery);
  const offersCollection = Boolean(config.offers_collection);
  const preference = config.shipping_provider_preference ?? null;

  items.push({
    id: "fulfillment_mode",
    ok: offersDelivery || offersCollection,
    message: offersDelivery || offersCollection
      ? "At least one fulfillment mode is enabled."
      : "Enable delivery and/or in-store collection.",
  });

  const liveBookingEnabled = await isLiveCourierBookingEnabled(admin);
  items.push({
    id: "platform_shipping",
    ok: liveBookingEnabled,
    message: isShippingKillSwitchActive()
      ? "Platform shipping is temporarily disabled (kill switch)."
      : liveBookingEnabled
        ? "Live courier booking is enabled platform-wide."
        : "Superadmin has live courier booking turned off.",
  });

  const credRow = await loadProviderCourierCredentialsRow(admin, providerId);
  const credStatus = publicCourierCredentialsStatus(credRow, { includeHints: false });

  if (offersDelivery) {
    items.push({
      id: "courier_preference",
      ok: Boolean(preference),
      message: preference
        ? `Courier preference: ${preference}.`
        : "Choose a courier for automated booking or use manual tracking only.",
    });

    if (preference) {
      const connected =
        preference === "courier-guy"
          ? credStatus["courier-guy"].connected
          : preference === "bob-go"
            ? credStatus["bob-go"].connected
            : credStatus.aramex.connected;
      items.push({
        id: "courier_credentials",
        ok: connected,
        message: connected
          ? "Courier account connected."
          : "Connect your courier API credentials (owner only).",
      });
      const verifiedAt =
        preference === "courier-guy"
          ? credStatus["courier-guy"].verifiedAt
          : preference === "bob-go"
            ? credStatus["bob-go"].verifiedAt
            : credStatus.aramex.verifiedAt;
      items.push({
        id: "courier_verified",
        ok: !preference || Boolean(verifiedAt) || !connected,
        message: verifiedAt
          ? "Courier connection tested successfully."
          : connected
            ? "Run “Test connection” after saving credentials."
            : "N/A until credentials are saved.",
      });
    }

    const { data: locations } = await (admin.from("provider_locations") as any)
      .select("id, address_line1, city, postal_code, phone, is_active")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .limit(5);
    const hasShipFrom = (locations ?? []).some(
      (loc: { address_line1?: string; city?: string; postal_code?: string }) =>
        Boolean(loc.address_line1?.trim() && loc.city?.trim() && loc.postal_code?.trim()),
    );
    items.push({
      id: "ship_from_location",
      ok: hasShipFrom,
      message: hasShipFrom
        ? "At least one active location has a complete ship-from address."
        : "Add postal code and address to an active salon location.",
    });
  }

  const readyForDeliveryCheckout = offersDelivery
    ? items.filter((i) =>
        ["fulfillment_mode", "ship_from_location"].includes(i.id),
      ).every((i) => i.ok)
    : items.find((i) => i.id === "fulfillment_mode")?.ok ?? false;

  const readyForCourierBooking =
    offersDelivery &&
    Boolean(preference) &&
    items.filter((i) =>
      ["courier_credentials", "courier_verified", "ship_from_location", "platform_shipping"].includes(i.id),
    ).every((i) => i.ok) &&
    liveBookingEnabled;

  return {
    readyForDeliveryCheckout,
    readyForCourierBooking,
    items,
  };
}
