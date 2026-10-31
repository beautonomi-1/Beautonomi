import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("GET comments route safety guards", () => {
  it("returns 404 for hideSocialFeed viewers unless provider", () => {
    const filePath = path.join(process.cwd(), "src/app/api/explore/posts/[id]/comments/route.ts");
    const source = fs.readFileSync(filePath, "utf8");
    expect(source).toContain("hideSocialFeed");
    expect(source).toContain("userCanAccessPostAsProvider");
  });
});
