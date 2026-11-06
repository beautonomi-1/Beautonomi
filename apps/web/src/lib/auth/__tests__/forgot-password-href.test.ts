import { describe, it, expect } from "vitest";
import {
  buildForgotPasswordHref,
  isValidForgotPasswordEmail,
  resolveForgotPasswordNextFromModal,
} from "../forgot-password-href";

describe("isValidForgotPasswordEmail", () => {
  it("accepts a simple valid email", () => {
    expect(isValidForgotPasswordEmail("user@example.com")).toBe(true);
  });

  it("rejects empty and malformed values", () => {
    expect(isValidForgotPasswordEmail("")).toBe(false);
    expect(isValidForgotPasswordEmail("not-an-email")).toBe(false);
    expect(isValidForgotPasswordEmail("@missing.local")).toBe(false);
  });
});

describe("buildForgotPasswordHref", () => {
  it("returns bare path when both params are empty", () => {
    expect(buildForgotPasswordHref({})).toBe("/forgot-password");
    expect(buildForgotPasswordHref({ email: "", next: "" })).toBe("/forgot-password");
  });

  it("includes valid email and next", () => {
    const href = buildForgotPasswordHref({
      email: "  user@example.com  ",
      next: "/booking?hold_id=1",
    });
    expect(href.startsWith("/forgot-password?")).toBe(true);
    const u = new URL(href, "https://example.com");
    expect(u.searchParams.get("email")).toBe("user@example.com");
    expect(u.searchParams.get("next")).toBe("/booking?hold_id=1");
  });

  it("omits invalid email", () => {
    const href = buildForgotPasswordHref({
      email: "bad",
      next: "/booking",
    });
    const u = new URL(href, "https://example.com");
    expect(u.searchParams.has("email")).toBe(false);
    expect(u.searchParams.get("next")).toBe("/booking");
  });

  it("omits unsafe next paths", () => {
    expect(buildForgotPasswordHref({ next: "//evil.com" })).toBe("/forgot-password");
    expect(buildForgotPasswordHref({ next: "https://evil.com/x" })).toBe("/forgot-password");
  });

  it("adds sent=1 only alongside a valid email", () => {
    const u = new URL(
      buildForgotPasswordHref({
        email: "user@example.com",
        next: "/account-settings/login-and-security",
        codeSent: true,
      }),
      "https://example.com",
    );
    expect(u.searchParams.get("sent")).toBe("1");
    expect(u.searchParams.get("next")).toBe("/account-settings/login-and-security");
    expect(buildForgotPasswordHref({ email: "bad", codeSent: true })).toBe("/forgot-password");
  });
});

describe("resolveForgotPasswordNextFromModal", () => {
  it("prefers redirectUrl when safe", () => {
    expect(
      resolveForgotPasswordNextFromModal({
        redirectUrl: "/partner-profile?slug=x",
        pathname: "/",
        search: "",
      }),
    ).toBe("/partner-profile?slug=x");
  });

  it("uses pathname and search when redirectUrl is absent", () => {
    expect(
      resolveForgotPasswordNextFromModal({
        pathname: "/explore",
        search: "?q=hair",
      }),
    ).toBe("/explore?q=hair");
  });

  it("returns null on excluded paths", () => {
    expect(
      resolveForgotPasswordNextFromModal({
        pathname: "/login",
        search: "?next=/booking",
      }),
    ).toBeNull();
  });

  it("drops unsafe redirectUrl and falls back to pathname", () => {
    expect(
      resolveForgotPasswordNextFromModal({
        redirectUrl: "//evil.com",
        pathname: "/explore",
        search: "",
      }),
    ).toBe("/explore");
  });
});
