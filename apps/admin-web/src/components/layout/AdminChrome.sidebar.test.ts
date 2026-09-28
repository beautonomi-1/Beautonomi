import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const chromeSource = readFileSync(join(__dirname, "AdminChrome.tsx"), "utf8");

describe("AdminChrome sidebar layout", () => {
  it("uses sticky sidebar on desktop and fixed drawer only below md", () => {
    expect(chromeSource).toMatch(/max-md:fixed/);
    expect(chromeSource).toMatch(/md:sticky md:top-0/);
    expect(chromeSource).not.toMatch(/md:static/);
  });

  it("scrolls main content to top on route change without hash", () => {
    expect(chromeSource).toMatch(/window\.scrollTo\(0, 0\)/);
  });

  it("persists nav scroll position in session storage", () => {
    expect(chromeSource).toMatch(/admin_nav_scroll/);
  });
});
