import fs from "fs";
import path from "path";

describe("Provider login signup CTA", () => {
  it("wires a tappable signup link to the signup route with joinToken", () => {
    const loginPath = path.join(__dirname, "../../app/(auth)/login.tsx");
    const src = fs.readFileSync(loginPath, "utf8");

    expect(src).toContain("goToSignup");
    expect(src).toContain("joinToken");
    expect(src).toContain("/(auth)/signup");
    expect(src).toContain('t("auth.signup")');
    expect(src).toContain('t("auth.dontHaveAccount")');
    expect(src).toContain('accessibilityRole="link"');
  });

  it("auth layout is the only post-login redirect and keeps joinToken", () => {
    const signupPath = path.join(__dirname, "../../app/(auth)/signup.tsx");
    const loginPath = path.join(__dirname, "../../app/(auth)/login.tsx");
    const layoutPath = path.join(__dirname, "../../app/(auth)/_layout.tsx");
    const signup = fs.readFileSync(signupPath, "utf8");
    const login = fs.readFileSync(loginPath, "utf8");
    const layout = fs.readFileSync(layoutPath, "utf8");

    expect(signup).toContain("joinToken");
    expect(signup).toContain("goToLogin");
    expect(signup).toContain('qs.set("joinToken", token)');
    expect(signup).toContain("/(auth)/login");
    expect(signup).not.toContain('router.replace("/")');
    expect(login).not.toContain('router.replace("/")');
    expect(layout).toContain("signedInHref");
    expect(layout).toContain("/join?token=");
    expect(layout).toContain("<Redirect href={signedInHref(joinToken)} />");
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
