import { describe, expect, it } from "vitest";
import { flattenNavItems, NAV_GROUPS } from "@/config/nav";
import { catalogHrefSet, INTEGRATION_CATALOG } from "./integrationCatalog";

const NAV_EXCEPTIONS = new Set([
  "/admin/control-plane/region-online-gateway",
  "/admin/control-plane/country-launch-checklist",
]);

describe("integrationCatalog nav parity", () => {
  it("catalog hrefs appear in sidebar with matching superadminOnly (except launch tools)", () => {
    const navByHref = new Map(flattenNavItems(NAV_GROUPS).map((item) => [item.href, item]));

    for (const entry of INTEGRATION_CATALOG) {
      if (NAV_EXCEPTIONS.has(entry.href)) continue;
      const nav = navByHref.get(entry.href);
      expect(nav, `missing nav for ${entry.href}`).toBeDefined();
      expect(nav?.superadminOnly === true).toBe(entry.superadminOnly);
    }
  });

  it("Paystack is superadmin-only in nav", () => {
    const paystack = flattenNavItems(NAV_GROUPS).find((i) => i.href === "/admin/integrations/paystack");
    expect(paystack?.superadminOnly).toBe(true);
  });

  it("catalog href set matches entries", () => {
    expect(catalogHrefSet().size).toBe(INTEGRATION_CATALOG.length);
  });
});
