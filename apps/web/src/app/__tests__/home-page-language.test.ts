import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const pageSrc = fs.readFileSync(
  path.resolve(__dirname, "../page.tsx"),
  "utf8",
);

describe("home page language", () => {
  it("resolves request language and translates the sr-only hero", () => {
    expect(pageSrc).toContain("resolveRequestLanguage");
    expect(pageSrc).toContain("getServerT");
    expect(pageSrc).toContain("web.seo.homeSrOnlyTitle");
    expect(pageSrc).not.toContain("Discover and book verified beauty professionals");
    expect(pageSrc).toContain('dynamic = "force-dynamic"');
  });
});
