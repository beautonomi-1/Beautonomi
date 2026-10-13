import type {
  CreateShipmentRequest,
  RateQuote,
  RateQuoteRequest,
  Shipment,
  ShippingProvider,
  TrackingUpdate,
} from "../index";
import { ShippingProviderNotConfiguredError } from "../index";
import type { CancelShipmentResult, LabelResult } from "../index";
import {
  cancelShiplogicStyleShipment,
  createShiplogicStyleShipment,
  fetchShiplogicStyleLabel,
  quoteShiplogicStyleRates,
  trackShiplogicStyle,
  type ShiplogicStyleConfig,
} from "./shiplogic-style";

/**
 * Courier Guy merchant API (ShipLogic).
 *
 * Host is `https://api.shiplogic.com` — sandbox vs live is the API token, not the URL.
 * The locker API at `https://api-tcg.co.za` needs lat/lng we do not collect, so it is
 * not used unless COURIER_GUY_BASE_URL is overridden by ops.
 *
 * Env: COURIER_GUY_API_KEY, optional COURIER_GUY_BASE_URL.
 * Callers may pass live keys from platform_secrets instead of env.
 */
export function createCourierGuyProvider(credentials?: {
  apiKey?: string;
  baseUrl?: string;
}): ShippingProvider {
  function config(): ShiplogicStyleConfig {
    const apiKey = credentials?.apiKey?.trim() || process.env.COURIER_GUY_API_KEY?.trim();
    if (!apiKey) throw new ShippingProviderNotConfiguredError("courier-guy");
    const baseUrl = (
      credentials?.baseUrl?.trim() ||
      process.env.COURIER_GUY_BASE_URL ||
      "https://api.shiplogic.com"
    ).replace(/\/+$/, "");
    return {
      providerId: "courier-guy",
      baseUrl,
      apiKey,
      countryName: (iso) => (iso === "ZA" ? "South Africa" : iso),
      ratesPath: "/v2/rates",
      shipmentsPath: "/v2/shipments",
      trackingUrl: (trackingNumber) =>
        `${baseUrl}/v2/tracking/shipments?waybill=${encodeURIComponent(trackingNumber)}`,
    };
  }

  async function quoteRates(req: RateQuoteRequest): Promise<RateQuote[]> {
    return quoteShiplogicStyleRates(config(), req);
  }

  async function createShipment(req: CreateShipmentRequest): Promise<Shipment> {
    return createShiplogicStyleShipment(config(), req);
  }

  async function track(trackingNumber: string): Promise<TrackingUpdate[]> {
    const cfg = config();
    try {
      return await trackShiplogicStyle(cfg, trackingNumber);
    } catch {
      return trackShiplogicStyle(
        {
          ...cfg,
          trackingUrl: (id) =>
            `${cfg.baseUrl}/v2/tracking/shipments?tracking_reference=${encodeURIComponent(id)}`,
        },
        trackingNumber,
      );
    }
  }

  async function cancelShipment(params: {
    shipmentId?: string | null;
    trackingNumber?: string | null;
  }): Promise<CancelShipmentResult> {
    const id = params.shipmentId?.trim() || params.trackingNumber?.trim();
    if (!id) return { ok: false, reason: "not_found", message: "Missing shipment id" };
    try {
      await cancelShiplogicStyleShipment(config(), id);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        reason: "courier_rejected",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function fetchLabel(params: {
    shipmentId?: string | null;
    trackingNumber?: string | null;
  }): Promise<LabelResult> {
    return fetchShiplogicStyleLabel(config(), params);
  }

  return {
    id: "courier-guy",
    quoteRates,
    createShipment,
    track,
    cancelShipment,
    fetchLabel,
  };
}
