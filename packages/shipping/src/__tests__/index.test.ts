import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getShippingProvider,
  ShippingProviderNotConfiguredError,
  type ShippingProviderId,
} from "../index";

/**
 * Smoke tests for the shipping-provider abstraction.
 *
 * These tests intentionally live inside the package so `pnpm --filter
 * @beautonomi/shipping test` has something to run — previously it failed the
 * turbo pipeline with "No test files found". They verify the factory
 * dispatches correctly and the "not configured" error path fires when the
 * courier env vars are missing, which is how product-order-lifecycle.ts
 * signals a fallback to manual fulfilment.
 */
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
    await expect(
      provider.quoteRates({
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
      }),
    ).rejects.toBeInstanceOf(ShippingProviderNotConfiguredError);
  });

  it("Courier Guy signals not configured when env vars are missing", async () => {
    const provider = getShippingProvider("courier-guy");
    await expect(
      provider.track("CG-TEST-123"),
    ).rejects.toBeInstanceOf(ShippingProviderNotConfiguredError);
  });

  it("Bob Go signals not configured when env vars are missing", async () => {
    const provider = getShippingProvider("bob-go");
    await expect(
      provider.track("BG-TEST-123"),
    ).rejects.toBeInstanceOf(ShippingProviderNotConfiguredError);
  });
});
