import type {
  CreateShipmentRequest,
  RateQuote,
  RateQuoteRequest,
  Shipment,
  ShippingProvider,
  TrackingUpdate,
} from "../index";
import { ShippingProviderNotConfiguredError } from "../index";

/**
 * Courier Guy (The Courier Guy) provider.
 *
 * Env: COURIER_GUY_API_KEY, COURIER_GUY_BASE_URL (defaults to production).
 */
export function createCourierGuyProvider(): ShippingProvider {
  const baseUrl = process.env.COURIER_GUY_BASE_URL ?? "https://api.thecourierguy.co.za";

  function assertConfigured() {
    if (!process.env.COURIER_GUY_API_KEY) {
      throw new ShippingProviderNotConfiguredError("courier-guy");
    }
  }

  async function quoteRates(_req: RateQuoteRequest): Promise<RateQuote[]> {
    assertConfigured();
    // TODO: hit `${baseUrl}/v1/rates` with auth header.
    return [];
  }

  async function createShipment(req: CreateShipmentRequest): Promise<Shipment> {
    assertConfigured();
    throw new Error(`Courier Guy createShipment not yet implemented (order ${req.orderRef})`);
  }

  async function track(trackingNumber: string): Promise<TrackingUpdate[]> {
    assertConfigured();
    // TODO: call `${baseUrl}/v1/tracking/${trackingNumber}`.
    return [
      {
        status: "pending",
        message: `Tracking ${trackingNumber} — stub response.`,
        occurredAt: new Date().toISOString(),
      },
    ];
  }

  return {
    id: "courier-guy",
    quoteRates,
    createShipment,
    track,
  };
}
