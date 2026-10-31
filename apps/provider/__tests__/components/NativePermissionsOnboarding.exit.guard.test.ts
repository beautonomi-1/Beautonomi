import fs from "fs";
import path from "path";

describe("NativePermissionsOnboarding exit", () => {
  it("welcome back and onRequestClose use sign-out confirm", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/components/NativePermissionsOnboarding.tsx"),
      "utf8",
    );
    expect(src).toContain("handleModalBack");
    expect(src).toContain("confirmUseDifferentAccount");
    expect(src).not.toContain('onRequestClose={() => {}}');
    expect(src).toContain("onRequestClose={handleModalBack}");
  });
});
