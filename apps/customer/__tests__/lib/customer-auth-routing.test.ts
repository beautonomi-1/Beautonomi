import fs from "fs";
import path from "path";

describe("navigateAfterCustomerAuth", () => {
  it("still sends incomplete onboarding users to home", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/lib/customer-auth-routing.ts"),
      "utf8",
    );
    expect(src).toContain("Incomplete onboarding → home");
    expect(src).toMatch(/completed\s*===\s*false|!completed/);
    expect(src).toContain("/(app)/(tabs)/home");
  });
});
