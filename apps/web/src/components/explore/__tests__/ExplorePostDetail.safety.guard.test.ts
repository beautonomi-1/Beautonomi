import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("ExplorePostDetail safety controls", () => {
  it("includes report and block menus plus comment report", () => {
    const filePath = path.join(process.cwd(), "src/components/explore/ExplorePostDetail.tsx");
    const source = fs.readFileSync(filePath, "utf8");
    expect(source).toContain("ContentReportDialog");
    expect(source).toContain("customer.contentReport.reportPost");
    expect(source).toContain("blockAuthor");
    expect(source).toContain("explore_comment");
  });
});
