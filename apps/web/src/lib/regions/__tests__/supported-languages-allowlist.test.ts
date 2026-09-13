import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const configSrc = fs.readFileSync(
  path.resolve(__dirname, "../config.ts"),
  "utf8",
);

describe("tenant region language allowlist", () => {
  it("does not invent a singleton [default_language] allowlist", () => {
    expect(configSrc).not.toMatch(
      /supportedLanguages\s*=\s*\[String\(tenant\.default_language\)/,
    );
  });
});
