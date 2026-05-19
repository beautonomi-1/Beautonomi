/**
 * Unit tests for role/portal helpers: getPortalForUser, getDefaultRouteForPortal.
 */

import { describe, it, expect } from "vitest";
import {
  getPortalForUser,
  getDefaultRouteForPortal,
} from "../role";

describe("getPortalForUser", () => {
  it("returns admin for superadmin", () => {
    expect(getPortalForUser({ role: "superadmin" })).toBe("admin");
  });

  it("returns customer for customer role", () => {
    expect(getPortalForUser({ role: "customer" })).toBe("customer");
  });

  it("returns provider when provider_owner and status active", () => {
    expect(
      getPortalForUser({ role: "provider_owner", provider_status: "active" })
    ).toBe("provider");
  });

  it("returns provider when provider_staff and status active", () => {
    expect(
      getPortalForUser({ role: "provider_staff", provider_status: "active" })
    ).toBe("provider");
  });

  it("returns provider_onboarding when provider_owner and status draft", () => {
    expect(
      getPortalForUser({ role: "provider_owner", provider_status: "draft" })
    ).toBe("provider_onboarding");
  });

  it("returns provider_onboarding when provider_owner and status pending_approval", () => {
    expect(
      getPortalForUser({
        role: "provider_owner",
        provider_status: "pending_approval",
      })
    ).toBe("provider_onboarding");
  });

  it("returns provider_onboarding when provider_owner and status suspended", () => {
    expect(
      getPortalForUser({ role: "provider_owner", provider_status: "suspended" })
    ).toBe("provider_onboarding");
  });

  it("returns provider_onboarding when provider_staff and status not active", () => {
    expect(
      getPortalForUser({ role: "provider_staff", provider_status: "draft" })
    ).toBe("provider_onboarding");
  });

  it("returns provider_onboarding when provider_owner and no status", () => {
    expect(getPortalForUser({ role: "provider_owner" })).toBe(
      "provider_onboarding"
    );
  });

  it("returns customer for support_agent role", () => {
    expect(getPortalForUser({ role: "support_agent" })).toBe("customer");
  });

  // §Release-audit 2026-04: legacy `users.role = provider_onboarding` must not
  // send active salons to the customer app. Pre-provider users stay on the
  // onboarding portal; once `providers.status` is active, use the provider portal.
  it("returns provider when role is provider_onboarding and provider is active", () => {
    expect(
      getPortalForUser({ role: "provider_onboarding", provider_status: "active" })
    ).toBe("provider");
  });

  it("returns provider_onboarding when role is provider_onboarding and not active", () => {
    expect(
      getPortalForUser({ role: "provider_onboarding", provider_status: "pending_approval" })
    ).toBe("provider_onboarding");
  });

  it("returns provider_onboarding when role is provider_onboarding and no provider_status", () => {
    expect(getPortalForUser({ role: "provider_onboarding" })).toBe(
      "provider_onboarding"
    );
  });

  it("returns provider_onboarding when role is provider_onboarding even with null provider_status", () => {
    expect(
      getPortalForUser({ role: "provider_onboarding", provider_status: null })
    ).toBe("provider_onboarding");
  });
});

describe("getDefaultRouteForPortal", () => {
  it("returns /admin/dashboard for admin", () => {
    expect(getDefaultRouteForPortal("admin")).toBe("/admin/dashboard");
  });

  it("returns /provider/dashboard for provider", () => {
    expect(getDefaultRouteForPortal("provider")).toBe("/provider/dashboard");
  });

  it("returns /provider/get-started for provider_onboarding", () => {
    expect(getDefaultRouteForPortal("provider_onboarding")).toBe(
      "/provider/get-started"
    );
  });

  it("returns /bookings for customer", () => {
    expect(getDefaultRouteForPortal("customer")).toBe("/bookings");
  });
});
