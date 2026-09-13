import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../route.ts"),
  "utf8",
);

describe("POST /api/location/validate", () => {
  it("looks up public providers with the admin client and visibility check", () => {
    expect(src).toContain("getSupabaseAdmin");
    expect(src).toContain("isProviderPubliclyVisible");
    expect(src).not.toMatch(/getSupabaseServer\(/);
  });
});
