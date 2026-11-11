import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.resolve(__dirname, "../route.ts"), "utf8");

describe("POST /api/provider/staff/[id]/invite (F3-20)", () => {
  it("never puts join_url on errorResponse details", () => {
    const errorBlocks = [...src.matchAll(/errorResponse\(([\s\S]*?)\);/g)].map((m) => m[1]);
    expect(errorBlocks.length).toBeGreaterThan(0);
    for (const block of errorBlocks) {
      expect(block).not.toMatch(/join_url/);
    }
  });

  it("does not console.log invitee email or user ids", () => {
    expect(src).not.toMatch(/console\.(log|info|warn|error)\([^)]*inviteEmail/);
    expect(src).not.toMatch(/console\.(log|info|warn|error)\([^)]*staff\.user_id/);
  });
});
