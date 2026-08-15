import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getShippingProvider,
  ShippingProviderNotConfiguredError,
  type ShippingProviderId,
} from "../index";

const SAMPLE_ROUTE = {
  origin: {
    name: "Store",
    line1: "1 Sender St",
    city: "Johannesburg",
    postalCode: "2000",
    country: "ZA",
  },
  destination: {
    name: "Buyer",
    line1: "1 Receiver Ave",
    city: "Cape Town",
    postalCode: "8000",
    country: "ZA",
  },
  parcels: [
    {
      weightKg: 1,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      description: "Smoke test",
    },
  ],
};

describe("getShippingProvider", () => {
  const ENV_KEYS = [
    "ARAMEX_ACCOUNT_NUMBER",
    "ARAMEX_ACCOUNT_PIN",
    "ARAMEX_USERNAME",
    "ARAMEX_PASSWORD",
    "COURIER_GUY_API_KEY",
    "BOB_GO_API_KEY",
  ];
  const snapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (snapshot[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = snapshot[key];
      }
    }
  });

  it.each<ShippingProviderId>(["aramex", "courier-guy", "bob-go"])(
    "returns a provider with the matching id for %s",
    (id) => {
      const provider = getShippingProvider(id);
      expect(provider.id).toBe(id);
      expect(typeof provider.quoteRates).toBe("function");
      expect(typeof provider.createShipment).toBe("function");
      expect(typeof provider.track).toBe("function");
    },
  );

  it("throws for an unknown provider id", () => {
    expect(() =>
      getShippingProvider("not-a-real-courier" as unknown as ShippingProviderId),
    ).toThrow(/Unknown shipping provider/);
  });

  it("Aramex signals not configured when env vars are missing", async () => {
    const provider = getShippingProvider("aramex");
    await expect(provider.quoteRates(SAMPLE_ROUTE)).rejects.toBeInstanceOf(
      ShippingProviderNotConfiguredError,
    );
  });

  it("Courier Guy signals not configured when env vars are missing", async () => {
    const provider = getShippingProvider("courier-guy");
    await expect(provider.track("CG-TEST-123")).rejects.toBeInstanceOf(
      ShippingProviderNotConfiguredError,
    );
  });

  it("Bob Go signals not configured when env vars are missing", async () => {
    const provider = getShippingProvider("bob-go");
    await expect(provider.track("BG-TEST-123")).rejects.toBeInstanceOf(
      ShippingProviderNotConfiguredError,
    );
  });
});

describe("live courier HTTP", () => {
  const ENV_KEYS = [
    "ARAMEX_ACCOUNT_NUMBER",
    "ARAMEX_ACCOUNT_PIN",
    "ARAMEX_USERNAME",
    "ARAMEX_PASSWORD",
    "COURIER_GUY_API_KEY",
    "BOB_GO_API_KEY",
  ];
  const snapshot: Record<string, string | undefined> = {};
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
  });

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("Courier Guy quotes live ShipLogic rates and ignores zero amounts", async () => {
    process.env.COURIER_GUY_API_KEY = "tcg-test";
    fetchMock.mockResolvedValue(
      jsonResponse({
        rates: [
          {
            rate: 89.5,
            currency: "ZAR",
            service_level: { code: "ECO", name: "Economy", description: "2-3 days" },
          },
          { rate: 0, service_level: { code: "FAKE", name: "Free" } },
        ],
      }),
    );
    const quotes = await getShippingProvider("courier-guy").quoteRates(SAMPLE_ROUTE);
    expect(quotes).toEqual([
      expect.objectContaining({
        amount: 89.5,
        currency: "ZAR",
        metadata: expect.objectContaining({ service_level_code: "ECO" }),
      }),
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("https://api.shiplogic.com/rates");
    expect((fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> }).headers?.Authorization).toBe(
      "Bearer tcg-test",
    );
  });

  it("Courier Guy accepts injected credentials without env", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rates: [{ rate: 10, currency: "ZAR", service_level: { code: "ECO", name: "Eco" } }] }));
    const quotes = await getShippingProvider("courier-guy", {
      "courier-guy": { apiKey: "from-admin" },
    }).quoteRates(SAMPLE_ROUTE);
    expect(quotes[0]?.amount).toBe(10);
    expect((fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> }).headers?.Authorization).toBe(
      "Bearer from-admin",
    );
  });

  it("Bob Go books using provider_slug from nested rates and tracks by reference", async () => {
    process.env.BOB_GO_API_KEY = "bob-test";
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          provider_rate_requests: [
            {
              status: "success",
              provider_slug: "the-courier-guy",
              provider_name: "The Courier Guy",
              responses: [
                {
                  status: "success",
                  service_level_code: "ECO",
                  service_name: "Economy",
                  total_price: 75,
                  currency: "ZAR",
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          tracking_reference: "BG123",
          tracking_url: "https://bobgo.co.za/track/BG123",
          service_level_code: "ECO",
          provider_slug: "the-courier-guy",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: "in_transit",
          checkpoints: [
            { status_friendly: "In transit", message: "Collected", date: "2026-08-15T10:00:00Z" },
          ],
        }),
      );

    const shipment = await getShippingProvider("bob-go").createShipment({
      ...SAMPLE_ROUTE,
      orderRef: "order-1",
    });
    expect(shipment.trackingNumber).toBe("BG123");
    expect(shipment.waybillUrl).toBe("https://bobgo.co.za/track/BG123");
    const bookBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as { body?: string }).body));
    expect(bookBody.service_level_code).toBe("ECO");
    expect(bookBody.provider_slug).toBe("the-courier-guy");

    const events = await getShippingProvider("bob-go").track("BG123");
    expect(events[0]?.status).toBe("in_transit");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
      "https://api.bobgo.co.za/v2/tracking?tracking_reference=BG123",
    );
  });

  it("Aramex does not invent a 0 ZAR rate when CalculateRate has errors", async () => {
    process.env.ARAMEX_ACCOUNT_NUMBER = "1";
    process.env.ARAMEX_ACCOUNT_PIN = "2";
    process.env.ARAMEX_USERNAME = "user";
    process.env.ARAMEX_PASSWORD = "pass";
    fetchMock.mockResolvedValue(
      jsonResponse({
        HasErrors: true,
        Notifications: [{ Message: "Invalid account" }],
      }),
    );
    await expect(getShippingProvider("aramex").quoteRates(SAMPLE_ROUTE)).rejects.toThrow(
      /Invalid account/,
    );
  });

  it("Aramex returns an empty quote list instead of a fake zero-amount rate", async () => {
    process.env.ARAMEX_ACCOUNT_NUMBER = "1";
    process.env.ARAMEX_ACCOUNT_PIN = "2";
    process.env.ARAMEX_USERNAME = "user";
    process.env.ARAMEX_PASSWORD = "pass";
    fetchMock.mockResolvedValue(
      jsonResponse({
        HasErrors: false,
        TotalAmount: { Value: 0, CurrencyCode: "ZAR" },
      }),
    );
    await expect(getShippingProvider("aramex").quoteRates(SAMPLE_ROUTE)).resolves.toEqual([]);
  });
});
