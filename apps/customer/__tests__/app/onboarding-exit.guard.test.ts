import fs from "fs";
import path from "path";

describe("Customer onboarding exit", () => {
  it("step 1 back goes home without sign-out; use different account signs out", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../app/(app)/onboarding/index.tsx"),
      "utf8",
    );
    expect(src).toContain('router.replace("/(app)/(tabs)/home")');
    expect(src).toContain("confirmUseDifferentAccount");
    expect(src).not.toMatch(/handleBack[\s\S]{0,200}signOut/);
  });
});
