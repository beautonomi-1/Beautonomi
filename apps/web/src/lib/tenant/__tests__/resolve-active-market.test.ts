import { describe, it, expect, afterEach, vi } from "vitest";
import { resolveActiveMarketFromRequest } from "../resolve-active-market";

describe("resolveActiveMarketFromRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses explicit country query when valid", () => {
    const req = new Request("http://localhost/api/public/home?country=gb", {
      headers: { host: "localhost" },
    });
    const r = resolveActiveMarketFromRequest(req, "gb");
    expect(r.countryCode).toBe("GB");
    expect(r.source).toBe("query");
  });

  it("uses X-Active-Market-Country when no explicit query", () => {
    const req = new Request("http://beautonomi.com/api/public/home", {
      headers: { host: "beautonomi.com", "x-active-market-country": "DE" },
    });
    const r = resolveActiveMarketFromRequest(req, null);
    expect(r.countryCode).toBe("DE");
    expect(r.source).toBe("header_hint");
  });

  it("maps host from TENANT_HOST_COUNTRY_MAP", () => {
    vi.stubEnv("TENANT_HOST_COUNTRY_MAP", JSON.stringify({ "app.example": "FR" }));
    const req = new Request("http://app.example/api", {
      headers: { host: "app.example" },
    });
    const r = resolveActiveMarketFromRequest(req, null);
    expect(r.countryCode).toBe("FR");
    expect(r.source).toBe("host");
  });

  it("prefers host mapping over geo headers", () => {
    vi.stubEnv("TENANT_HOST_COUNTRY_MAP", JSON.stringify({ "beautonomi.co.uk": "GB" }));
    const req = new Request("https://beautonomi.co.uk/api/public/home", {
      headers: { host: "beautonomi.co.uk", "x-vercel-ip-country": "US" },
    });
    const r = resolveActiveMarketFromRequest(req, null);
    expect(r.countryCode).toBe("GB");
    expect(r.source).toBe("host");
  });

  it("does not pin global entry host to a single market", () => {
    vi.stubEnv("NEXT_PUBLIC_GLOBAL_ENTRY_HOST", "beautonomi.com");
    vi.stubEnv("TENANT_HOST_COUNTRY_MAP", JSON.stringify({ "beautonomi.com": "ZA" }));
    const req = new Request("http://beautonomi.com/api/public/home", {
      headers: { host: "beautonomi.com", "x-vercel-ip-country": "US" },
    });
    const r = resolveActiveMarketFromRequest(req, null);
    expect(r.countryCode).toBe("US");
    expect(r.source).toBe("geo_header");
  });

  it("falls back to DEFAULT_MARKET_COUNTRY when no hints exist", () => {
    vi.stubEnv("DEFAULT_MARKET_COUNTRY", "GB");
    const req = new Request("http://unknown-host.local/api/public/home", {
      headers: { host: "unknown-host.local" },
    });
    const r = resolveActiveMarketFromRequest(req, null);
    expect(r.countryCode).toBe("GB");
    expect(r.source).toBe("default");
  });
});
