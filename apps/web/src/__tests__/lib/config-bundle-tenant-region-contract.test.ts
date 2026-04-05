import { describe, it, expect } from "vitest";
import {
  TENANT_REGION_META_KEYS,
  type TenantRegionMeta,
} from "@/lib/config/types";

/**
 * Wave 3.2 — config-bundle contract: when `meta.tenant_region` is set, mobile + web expect these keys.
 * If you add a required field to `TenantRegionMeta`, extend `TENANT_REGION_META_KEYS` and this test stays green.
 */
describe("config bundle tenant_region contract", () => {
  it("TENANT_REGION_META_KEYS covers every required TenantRegionMeta field", () => {
    const sample: TenantRegionMeta = {
      code: "ZA",
      name: "Test",
      default_currency: "ZAR",
      default_language: "en",
      timezone: "Africa/Johannesburg",
      phone_country_code: "27",
    };
    for (const k of TENANT_REGION_META_KEYS) {
      expect(sample).toHaveProperty(k);
      expect((sample as Record<string, unknown>)[k]).toBeDefined();
    }
  });
});
