import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("provider packages mutations (F3-03 / F3-27)", () => {
  it("POST, PATCH, and DELETE require edit_services", () => {
    const list = readFileSync(path.join(__dirname, "..", "route.ts"), "utf8");
    const byId = readFileSync(path.join(__dirname, "..", "[id]", "route.ts"), "utf8");
    expect(list).toContain('requirePermission("edit_services"');
    expect(byId.match(/requirePermission\("edit_services"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
