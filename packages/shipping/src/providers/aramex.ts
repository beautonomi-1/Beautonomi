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
 * Aramex provider.
 *
 * Wires straight into the Aramex REST API. Credentials expected in env:
 *   ARAMEX_ACCOUNT_NUMBER, ARAMEX_ACCOUNT_PIN,
 *   ARAMEX_USERNAME, ARAMEX_PASSWORD, ARAMEX_SOURCE
 */
export function createAramexProvider(): ShippingProvider {
  const required = [
    "ARAMEX_ACCOUNT_NUMBER",
    "ARAMEX_ACCOUNT_PIN",
    "ARAMEX_USERNAME",
    "ARAMEX_PASSWORD",
  ] as const;

  function assertConfigured() {
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length > 0) throw new ShippingProviderNotConfiguredError("aramex");
  }

  async function quoteRates(_req: RateQuoteRequest): Promise<RateQuote[]> {
    assertConfigured();
    // TODO: implement Aramex rate query. Placeholder returns a single stubbed rate.
    return [
      {
        service: "Priority Domestic",
        amount: 0,
        currency: "ZAR",
        etaDays: 2,
      },
    ];
  }

  async function createShipment(req: CreateShipmentRequest): Promise<Shipment> {
    assertConfigured();
    // TODO: call CreateShipments SOAP/REST endpoint.
    throw new Error(`Aramex createShipment not yet implemented (order ${req.orderRef})`);
  }

  async function track(trackingNumber: string): Promise<TrackingUpdate[]> {
    assertConfigured();
    // TODO: call TrackShipments endpoint.
    return [
      {
        status: "pending",
        message: `Tracking ${trackingNumber} — stub response.`,
        occurredAt: new Date().toISOString(),
      },
    ];
  }

  return {
    id: "aramex",
    quoteRates,
    createShipment,
    track,
  };
}
