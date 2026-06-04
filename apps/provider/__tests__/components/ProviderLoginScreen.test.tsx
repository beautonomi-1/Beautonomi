import fs from "fs";
import path from "path";

describe("Provider login signup CTA", () => {
  it("wires a tappable signup link to the signup route", () => {
    const loginPath = path.join(__dirname, "../../app/(auth)/login.tsx");
    const src = fs.readFileSync(loginPath, "utf8");

    expect(src).toContain("goToSignup");
    expect(src).toContain('router.push("/(auth)/signup"');
    expect(src).toContain("Sign up for a new account");
    expect(src).toContain("Don't have an account?");
  });

  it("signup screen persists provider signup source before auth", () => {
    const signupPath = path.join(__dirname, "../../app/(auth)/signup.tsx");
    const src = fs.readFileSync(signupPath, "utf8");

    expect(src).toContain("persistProviderSignupSource");
    expect(src).toContain("applyPendingSignupPreferences");
    expect(src).toContain('router.replace("/")');
  });
});
