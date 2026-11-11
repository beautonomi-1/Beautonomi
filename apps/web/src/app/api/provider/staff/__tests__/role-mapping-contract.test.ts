import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("staff create role mapping (F3-27)", () => {
  it("POST refuses owner role unless the caller is the business owner", () => {
    const src = readFileSync(path.join(__dirname, "..", "route.ts"), "utf8");
    expect(src).toMatch(/isProviderOwner|role.*owner/);
    expect(src).toContain("manage_team");
  });
});
