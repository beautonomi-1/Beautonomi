import { describe, it, expect } from "vitest";
import {
  RESET_PASSWORD_PATH,
  buildAuthErrorLoginPath,
  parseImplicitAuthFragment,
  resolveImplicitAuthDestination,
} from "../implicit-auth-fragment";

describe("parseImplicitAuthFragment", () => {
  it("returns none for empty fragments", () => {
    expect(parseImplicitAuthFragment("")).toEqual({ kind: "none" });
    expect(parseImplicitAuthFragment("#")).toEqual({ kind: "none" });
    expect(parseImplicitAuthFragment(null)).toEqual({ kind: "none" });
  });

  it("extracts recovery session tokens", () => {
    expect(
      parseImplicitAuthFragment("#access_token=at&expires_in=3600&refresh_token=rt&token_type=bearer&type=recovery"),
    ).toEqual({ kind: "session", accessToken: "at", refreshToken: "rt", type: "recovery" });
  });

  it("requires both tokens", () => {
    expect(parseImplicitAuthFragment("#access_token=at&type=recovery")).toEqual({ kind: "none" });
  });

  it("surfaces Supabase errors (e.g. expired link)", () => {
    expect(
      parseImplicitAuthFragment("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"),
    ).toEqual({ kind: "error", message: "Email link is invalid or has expired" });
  });
});

describe("resolveImplicitAuthDestination", () => {
  it("sends recovery to the reset-password page", () => {
    expect(resolveImplicitAuthDestination("recovery", null)).toBe(RESET_PASSWORD_PATH);
  });

  it("forwards a safe next on recovery", () => {
    expect(resolveImplicitAuthDestination("recovery", "/provider/join?token=abc")).toBe(
      `${RESET_PASSWORD_PATH}?next=%2Fprovider%2Fjoin%3Ftoken%3Dabc`,
    );
  });

  it("drops open-redirect next values", () => {
    expect(resolveImplicitAuthDestination("recovery", "//evil.com")).toBe(RESET_PASSWORD_PATH);
    expect(resolveImplicitAuthDestination("signup", "https://evil.com")).toBe("/portal");
    expect(resolveImplicitAuthDestination("signup", "/\\evil.com")).toBe("/portal");
  });

  it("routes other types to next or the portal resolver", () => {
    expect(resolveImplicitAuthDestination("signup", null)).toBe("/portal");
    expect(resolveImplicitAuthDestination("magiclink", "/onboarding")).toBe("/onboarding");
  });
});

describe("buildAuthErrorLoginPath", () => {
  it("builds the login error path with a safe next", () => {
    expect(buildAuthErrorLoginPath("missing_code", "/provider/get-started")).toBe(
      "/login?error=missing_code&next=%2Fprovider%2Fget-started",
    );
    expect(buildAuthErrorLoginPath("missing_code", "//evil.com")).toBe("/login?error=missing_code");
  });
});
