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
 * Bob Go provider (formerly uAfrica).
 *
 * Env: BOB_GO_API_KEY, BOB_GO_BASE_URL (defaults to api.bobgo.co.za).
 */
export function createBobGoProvider(): ShippingProvider {
  const baseUrl = process.env.BOB_GO_BASE_URL ?? "https://api.bobgo.co.za";

  function assertConfigured() {
    if (!process.env.BOB_GO_API_KEY) {
      throw new ShippingProviderNotConfiguredError("bob-go");
    }
  }

  async function quoteRates(_req: RateQuoteRequest): Promise<RateQuote[]> {
    assertConfigured();
    // TODO: POST to `${baseUrl}/rates` with x-api-key.
    return [];
  }

  async function createShipment(req: CreateShipmentRequest): Promise<Shipment> {
    assertConfigured();
    throw new Error(`Bob Go createShipment not yet implemented (order ${req.orderRef})`);
  }

  async function track(trackingNumber: string): Promise<TrackingUpdate[]> {
    assertConfigured();
    // TODO: GET `${baseUrl}/tracking/${trackingNumber}`.
    return [
      {
        status: "pending",
        message: `Tracking ${trackingNumber} — stub response.`,
        occurredAt: new Date().toISOString(),
      },
    ];
  }

  return {
    id: "bob-go",
    quoteRates,
    createShipment,
    track,
  };
}
