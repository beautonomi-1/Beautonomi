import type {
  CreateShipmentRequest,
  RateQuote,
  RateQuoteRequest,
  Shipment,
  ShippingProvider,
  TrackingUpdate,
} from "../index";
import { ShippingProviderNotConfiguredError } from "../index";
import {
  createShiplogicStyleShipment,
  quoteShiplogicStyleRates,
  trackShiplogicStyle,
  type ShiplogicStyleConfig,
} from "./shiplogic-style";

/**
 * Bob Go v2 (Bearer token).
 *
 * Production: https://api.bobgo.co.za/v2
 * Sandbox: https://api.sandbox.bobgo.co.za/v2
 *
 * Env: BOB_GO_API_KEY, optional BOB_GO_BASE_URL.
 * Callers may pass live keys from platform_secrets instead of env.
 */
export function createBobGoProvider(credentials?: {
  apiKey?: string;
  baseUrl?: string;
}): ShippingProvider {
  function config(): ShiplogicStyleConfig {
    const apiKey = credentials?.apiKey?.trim() || process.env.BOB_GO_API_KEY?.trim();
    if (!apiKey) throw new ShippingProviderNotConfiguredError("bob-go");
    const baseUrl = (
      credentials?.baseUrl?.trim() ||
      process.env.BOB_GO_BASE_URL ||
      "https://api.bobgo.co.za/v2"
    ).replace(/\/+$/, "");
    return {
      providerId: "bob-go",
      baseUrl,
      apiKey,
      countryName: (iso) => iso,
      ratesPath: "/rates",
      shipmentsPath: "/shipments",
      trackingUrl: (trackingNumber) =>
        `${baseUrl}/tracking?tracking_reference=${encodeURIComponent(trackingNumber)}`,
      requireProviderSlug: true,
    };
  }

  async function quoteRates(req: RateQuoteRequest): Promise<RateQuote[]> {
    return quoteShiplogicStyleRates(config(), req);
  }

  async function createShipment(req: CreateShipmentRequest): Promise<Shipment> {
    return createShiplogicStyleShipment(config(), req);
  }

  async function track(trackingNumber: string): Promise<TrackingUpdate[]> {
    return trackShiplogicStyle(config(), trackingNumber);
  }

  return {
    id: "bob-go",
    quoteRates,
    createShipment,
    track,
  };
}
