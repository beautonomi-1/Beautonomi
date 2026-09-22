import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { assertSupportedMarketAddressCountry } from "../market-availability";

describe("assertSupportedMarketAddressCountry", () => {
  const prevGuard = process.env.MARKET_TRANSACTION_GUARD;

  beforeEach(() => {
    process.env.MARKET_TRANSACTION_GUARD = "true";
    process.env.SUPPORTED_MARKET_COUNTRIES = "ZA";
  });

  afterEach(() => {
    if (prevGuard === undefined) delete process.env.MARKET_TRANSACTION_GUARD;
    else process.env.MARKET_TRANSACTION_GUARD = prevGuard;
  });

  it("allows South Africa display name", () => {
    expect(assertSupportedMarketAddressCountry("South Africa")).toBeNull();
  });

  it("allows ZA ISO2", () => {
    expect(assertSupportedMarketAddressCountry("ZA")).toBeNull();
  });

  it("rejects United Kingdom when only ZA is live", async () => {
    const res = assertSupportedMarketAddressCountry("United Kingdom");
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
    const body = await res!.json();
    expect(body.code).toBe("ADDRESS_COUNTRY_UNSUPPORTED");
  });

  it("rejects GB ISO2 when only ZA is live", async () => {
    const res = assertSupportedMarketAddressCountry("GB");
    expect(res?.status).toBe(403);
  });

  it("rejects empty or unresolvable country", async () => {
    const res = assertSupportedMarketAddressCountry("Not A Real Country");
    expect(res?.status).toBe(400);
    const body = await res!.json();
    expect(body.code).toBe("INVALID_ADDRESS_COUNTRY");
  });

  it("rejects empty country", async () => {
    expect(assertSupportedMarketAddressCountry("")?.status).toBe(400);
  });
});
