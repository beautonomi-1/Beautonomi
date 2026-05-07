import { describe, it, expect, vi } from "vitest";
import { validateProviderCatalogPackageMatch } from "../validate-provider-package-booking";

function mockAdminForPackage(opts: { offeringItem?: { offering_id: string; quantity?: number } | null }) {
  const offeringItem = opts.offeringItem ?? { offering_id: "00000000-0000-0000-0000-000000000001", quantity: 1 };
  return {
    from: vi.fn((table: string) => {
      if (table === "service_packages") {
        const row = {
          id: "pkg-1",
          provider_id: "prov-1",
          is_active: true,
          price: 100,
          discount_percentage: 10,
        };
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: row, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "package_locations") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      if (table === "service_package_items") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: offeringItem ? [offeringItem] : [],
                error: null,
              }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  } as any;
}

describe("validateProviderCatalogPackageMatch", () => {
  it("allows empty services when allowEmptyServices is true (group shell before participants)", async () => {
    const admin = mockAdminForPackage({});
    const r = await validateProviderCatalogPackageMatch({
      supabaseAdmin: admin,
      providerId: "prov-1",
      packageId: "pkg-1",
      locationType: "at_salon",
      locationId: null,
      services: [],
      products: [],
      allowEmptyServices: true,
    });
    expect(r).toMatchObject({ ok: true });
  });

  it("rejects empty services when package has service entitlements and allowEmptyServices is false", async () => {
    const admin = mockAdminForPackage({});
    const r = await validateProviderCatalogPackageMatch({
      supabaseAdmin: admin,
      providerId: "prov-1",
      packageId: "pkg-1",
      locationType: "at_salon",
      locationId: null,
      services: [],
      products: [],
      allowEmptyServices: false,
    });
    expect(r).toMatchObject({
      ok: false,
      code: "PACKAGE_ENTITLEMENT_MISMATCH",
    });
  });
});
