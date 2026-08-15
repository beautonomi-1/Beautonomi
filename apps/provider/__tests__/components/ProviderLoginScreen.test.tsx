import fs from "fs";
import path from "path";

describe("Provider login signup CTA", () => {
  it("wires a tappable signup link to the signup route with joinToken", () => {
    const loginPath = path.join(__dirname, "../../app/(auth)/login.tsx");
    const src = fs.readFileSync(loginPath, "utf8");

    expect(src).toContain("goToSignup");
    expect(src).toContain("joinToken");
    expect(src).toContain("/(auth)/signup");
    expect(src).toContain("Sign up for a new account");
    expect(src).toContain("Don't have an account?");
  });

  it("signup screen preserves joinToken through postLoginPath", () => {
    const signupPath = path.join(__dirname, "../../app/(auth)/signup.tsx");
    const src = fs.readFileSync(signupPath, "utf8");

    expect(src).toContain("joinToken");
    expect(src).toContain("postLoginPath");
    expect(src).toContain("redirectPath ?? \"/\"");
    expect(src).toContain("goToLogin");
    expect(src).toContain('qs.set("joinToken", token)');
    expect(src).toContain("/(auth)/login");
    expect(src).not.toContain('router.replace("/")');
  });

  it("join screen persists invited salon as active org after accept", () => {
    const joinPath = path.join(__dirname, "../../app/join.tsx");
    const src = fs.readFileSync(joinPath, "utf8");
    expect(src).toContain("persistActiveProviderOrgHint");
    expect(src).toContain("provider_id");
  });

  it("signup screen persists provider signup source before auth", () => {
    const signupPath = path.join(__dirname, "../../app/(auth)/signup.tsx");
    const src = fs.readFileSync(signupPath, "utf8");

    expect(src).toContain("persistProviderSignupSource");
    expect(src).toContain("applyPendingSignupPreferences");
  });

  it("join screen clears portal cache before entering app", () => {
    const joinPath = path.join(__dirname, "../../app/join.tsx");
    const src = fs.readFileSync(joinPath, "utf8");

    expect(src).toContain("clearPortalCache");
  });
});
