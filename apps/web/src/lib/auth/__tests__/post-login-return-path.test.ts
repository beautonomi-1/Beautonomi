import { describe, expect, it } from "vitest";
import {
  resolvePortalAwareReturnPathname,
  isSafeRelativeRedirect,
  sanitizeRelativeRedirect,
} from "../post-login-return-path";

describe("resolvePortalAwareReturnPathname", () => {
  it("keeps provider onboarding users inside setup routes", () => {
    expect(resolvePortalAwareReturnPathname("provider_onboarding", "/provider/onboarding")).toBe(
      "/provider/onboarding",
    );
    expect(resolvePortalAwareReturnPathname("provider_onboarding", "/provider/get-started")).toBe(
      "/provider/get-started",
    );
  });

  it("sends provider onboarding users away from active-provider routes", () => {
    expect(resolvePortalAwareReturnPathname("provider_onboarding", "/provider/dashboard")).toBe(
      "/provider/get-started",
    );
  });
});

describe("isSafeRelativeRedirect", () => {
  it.each([
    ["/onboarding"],
    ["/provider/dashboard?next=/foo"],
    ["/account-settings"],
  ])("accepts same-origin paths: %s", (value) => {
    expect(isSafeRelativeRedirect(value)).toBe(true);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["http://evil.com"],
    ["https://evil.com/foo"],
    ["//evil.com"],
    ["//evil.com/login"],
    ["/\\evil.com"],
    ["/javascript:alert(1)"],
    ["javascript:alert(1)"],
    ["onboarding"],
  ])("rejects unsafe redirect: %s", (value) => {
    expect(isSafeRelativeRedirect(value)).toBe(false);
  });
});

describe("sanitizeRelativeRedirect", () => {
  it("returns null for unsafe inputs", () => {
    expect(sanitizeRelativeRedirect("//evil.com")).toBeNull();
    expect(sanitizeRelativeRedirect(null)).toBeNull();
  });
  it("trims and returns safe inputs", () => {
    expect(sanitizeRelativeRedirect("  /bookings ")).toBe("/bookings");
  });
});
