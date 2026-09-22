import { NextRequest } from "next/server";
import {
  assertTransactionalMarketAllowed,
  evaluateVisitorMarketAvailabilityFromRequest,
} from "@/lib/tenant/market-availability";

describe("evaluateVisitorMarketAvailabilityFromRequest", () => {
  it("uses geo before host for regional ZA hostname", () => {
    const req = new NextRequest("https://beautonomi.co.za/", {
      headers: {
        host: "beautonomi.co.za",
        "cf-ipcountry": "US",
      },
    });
    const availability = evaluateVisitorMarketAvailabilityFromRequest(req);
    expect(availability.countryCode).toBe("US");
    expect(availability.status).toBe("unsupported");
  });
});

describe("assertTransactionalMarketAllowed", () => {
  it("blocks unsupported visitor without shop opt-in", () => {
    const req = new NextRequest("https://beautonomi.co.za/", {
      headers: {
        host: "beautonomi.co.za",
        "cf-ipcountry": "US",
      },
    });
    const res = assertTransactionalMarketAllowed({
      request: req,
      tenantSlug: "za",
      tenantRegionCode: "ZA",
    });
    expect(res?.status).toBe(403);
  });

  it("allows unsupported visitor with X-Shop-Market ZA on ZA tenant", () => {
    const req = new NextRequest("https://beautonomi.co.za/", {
      headers: {
        host: "beautonomi.co.za",
        "cf-ipcountry": "US",
        "x-shop-market": "ZA",
      },
    });
    const res = assertTransactionalMarketAllowed({
      request: req,
      tenantSlug: "za",
      tenantRegionCode: "ZA",
    });
    expect(res).toBeNull();
  });
});
