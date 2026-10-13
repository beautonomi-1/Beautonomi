/**
 * Live sandbox contract tests — run only when credentials are set:
 *   SHIPPING_SANDBOX_COURIER_GUY=1 + COURIER_GUY_API_KEY
 *   SHIPPING_SANDBOX_BOB_GO=1 + BOB_GO_API_KEY (+ optional BOB_GO_BASE_URL sandbox)
 *   SHIPPING_SANDBOX_ARAMEX=1 + ARAMEX_* vars
 */
import { describe, expect, it } from "vitest";
import { getShippingProvider } from "../index";

const SAMPLE_ROUTE = {
  origin: {
    name: "Store",
    line1: "1 Sender St",
    city: "Johannesburg",
    postalCode: "2000",
    country: "ZA",
    phone: "+27110000000",
    email: "ops@example.com",
  },
  destination: {
    name: "Buyer",
    line1: "1 Receiver Ave",
    city: "Cape Town",
    postalCode: "8000",
    country: "ZA",
    phone: "+27821234567",
    email: "buyer@example.com",
  },
  parcels: [
    {
      weightKg: 1,
      lengthCm: 20,
      widthCm: 15,
      heightCm: 5,
      description: "Sandbox contract",
    },
  ],
};

describe.runIf(process.env.SHIPPING_SANDBOX_COURIER_GUY === "1")("Courier Guy sandbox", () => {
  it("quotes at least one rate", async () => {
    const quotes = await getShippingProvider("courier-guy").quoteRates(SAMPLE_ROUTE);
    expect(quotes.length).toBeGreaterThan(0);
  });
});

describe.runIf(process.env.SHIPPING_SANDBOX_BOB_GO === "1")("Bob Go sandbox", () => {
  it("quotes at least one rate", async () => {
    const quotes = await getShippingProvider("bob-go").quoteRates(SAMPLE_ROUTE);
    expect(quotes.length).toBeGreaterThan(0);
  });
});

describe.runIf(process.env.SHIPPING_SANDBOX_ARAMEX === "1")("Aramex sandbox", () => {
  it("quotes at least one rate", async () => {
    const quotes = await getShippingProvider("aramex").quoteRates(SAMPLE_ROUTE);
    expect(quotes.length).toBeGreaterThan(0);
  });
});
