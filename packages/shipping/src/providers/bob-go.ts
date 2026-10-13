import type {
  CancelShipmentResult,
  CreateShipmentRequest,
  LabelResult,
  RateQuote,
  RateQuoteRequest,
  Shipment,
  ShippingProvider,
  TrackingUpdate,
} from "../index";
import { ShippingProviderNotConfiguredError } from "../index";
import { shippingJsonRequest } from "../http";
import { asRecord, strField } from "../map-tracking";
import {
  cancelShiplogicStyleShipment,
  createShiplogicStyleShipment,
  fetchShiplogicStyleLabel,
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
    const cfg = config();
    try {
      return await trackShiplogicStyle(cfg, trackingNumber);
    } catch {
      const payload = await shippingJsonRequest({
        url: `${cfg.baseUrl.replace(/\/+$/, "")}/tracking-events?tracking_reference=${encodeURIComponent(trackingNumber)}`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          Accept: "application/json",
        },
      });
      const root = asRecord(payload);
      const events = Array.isArray(root.data) ? root.data : Array.isArray(root.events) ? root.events : [];
      if (events.length === 0) return [];
      return events.map((event) => {
        const rec = asRecord(event);
        const status = strField(rec.status) ?? strField(rec.message) ?? "pending";
        return {
          status: "in_transit" as const,
          message: status,
          occurredAt: strField(rec.occurred_at) ?? strField(rec.date) ?? new Date().toISOString(),
        };
      });
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
    const id = params.shipmentId?.trim() || params.trackingNumber?.trim();
    if (!id) throw new Error("shipment id or tracking number required for label");
    const cfg = config();
    try {
      return await fetchShiplogicStyleLabel(cfg, params);
    } catch {
      const payload = asRecord(
        await shippingJsonRequest({
          url: `${cfg.baseUrl.replace(/\/+$/, "")}/shipments/${encodeURIComponent(id)}/waybill`,
          method: "GET",
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            Accept: "application/json",
          },
        }),
      );
      const url = strField(payload.url) ?? strField(payload.waybill_url);
      if (url) return { url, contentType: "application/pdf" };
      throw new Error("Bob Go label response missing URL");
    }
  }

  return {
    id: "bob-go",
    quoteRates,
    createShipment,
    track,
    cancelShipment,
    fetchLabel,
  };
}
