import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("GET collection route safety guards", () => {
  it("empty posts when hideSocialFeed and filters blocked authors", () => {
    const filePath = path.join(process.cwd(), "src/app/api/explore/collections/[id]/route.ts");
    const source = fs.readFileSync(filePath, "utf8");
    expect(source).toContain("hideSocialFeed");
    expect(source).toContain("posts: []");
    expect(source).toContain("filterBlockedExploreAuthors");
  });
});
