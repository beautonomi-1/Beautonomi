import { PERMISSION_COPY } from "@/lib/native-permissions";

describe("PERMISSION_COPY (customer)", () => {
  it("uses neutral wording without Allow CTAs", () => {
    for (const copy of Object.values(PERMISSION_COPY)) {
      expect(copy.message.toLowerCase()).not.toMatch(/^allow\b/);
      expect(copy.message).not.toMatch(/\bAllow /);
    }
  });
});
