import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.resolve(__dirname, "../route.ts"), "utf8");

describe("POST /api/mapbox/reverse-geocode (F3-11)", () => {
  it("requires an authenticated role and keeps the Mapbox rate limit", () => {
    expect(src).toContain("requireRoleInApi");
    expect(src).not.toContain("optionalAuthInApi");
    expect(src).toContain("checkMapboxRateLimit");
  });
});
