import fs from "fs";
import path from "path";
import { describe, expect, it } from "@jest/globals";

describe("explore-video safety controls", () => {
  it("includes report, block, and comment report wiring", () => {
    const filePath = path.join(
      process.cwd(),
      "app/(app)/explore-video.tsx",
    );
    const source = fs.readFileSync(filePath, "utf8");
    expect(source).toContain("ContentReportSheet");
    expect(source).toContain("confirmBlockUser");
    expect(source).toContain("openContentReport(\"explore_comment\"");
    expect(source).toContain("onMorePress={showMoreOptions}");
    expect(source).toContain("dropPostsByProvider");
  });
});
