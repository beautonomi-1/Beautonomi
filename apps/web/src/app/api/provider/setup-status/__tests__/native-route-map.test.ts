import { describe, it, expect } from "vitest";
import { NATIVE_ROUTE_BY_ID } from "../route";

/**
 * Regression guard: the setup checklist on the provider mobile app reads
 * `native_route` per step from this map. If a step ID is removed or
 * misspelled, the corresponding tile silently routes to the fallback wizard
 * which is the exact bug we just fixed.
 */
describe("setup-status NATIVE_ROUTE_BY_ID", () => {
  const REQUIRED_STEP_IDS = [
    "profile-details",
    "personal-profile",
    "service-address",
    "profile-photo",
    "services",
    "availability",
    "payment",
    "payment-methods",
    "payout",
    "gallery",
    "identity-verification",
  ];

  it("has a native route for every known setup step ID", () => {
    for (const id of REQUIRED_STEP_IDS) {
      expect(NATIVE_ROUTE_BY_ID[id]).toBeTruthy();
    }
  });

  it("all native routes point into the provider mobile app shell", () => {
    for (const id of REQUIRED_STEP_IDS) {
      expect(NATIVE_ROUTE_BY_ID[id]).toMatch(/^\/\(app\)\/\(tabs\)\/more\//);
    }
  });

  it("does not leak any web-style /provider/ paths", () => {
    for (const route of Object.values(NATIVE_ROUTE_BY_ID)) {
      expect(route).not.toMatch(/^\/provider\//);
    }
  });
});
