import { describe, expect, it } from "vitest";
import {
  controlPlaneIntegrationsHubHrefs,
  filterCatalogEntries,
  INTEGRATION_CATALOG,
  integrationHubCardGroups,
} from "./integrationCatalog";

describe("integrationCatalog", () => {
  it("excludes superadmin-only hrefs for non-superadmin hub groups", () => {
    const visible = filterCatalogEntries(false);
    expect(visible.some((e) => e.superadminOnly)).toBe(false);
    expect(visible.some((e) => e.href.includes("paystack"))).toBe(false);
    expect(visible.some((e) => e.href.includes("stripe"))).toBe(false);
    const groups = integrationHubCardGroups(false);
    expect(groups.some((g) => g.heading === "Platform")).toBe(false);
  });

  it("includes Stripe, Rendobar, Wasender, Apple, and PayCloud Operations for superadmin", () => {
    const hrefs = filterCatalogEntries(true).map((e) => e.href);
    expect(hrefs).toContain("/admin/control-plane/integrations/stripe");
    expect(hrefs).toContain("/admin/integrations/rendobar");
    expect(hrefs).toContain("/admin/control-plane/integrations/wasender");
    expect(hrefs).toContain("/admin/integrations/apple");
    expect(hrefs).toContain("/admin/integrations/paycloud-operations");
  });

  it("control-plane platform index hrefs are platform group plus integrations hub", () => {
    const cp = controlPlaneIntegrationsHubHrefs();
    const platform = INTEGRATION_CATALOG.filter((e) => e.group === "platform").map((e) => e.href);
    expect(new Set(cp)).toEqual(new Set([...platform, "/admin/integrations-hub"]));
  });
});
