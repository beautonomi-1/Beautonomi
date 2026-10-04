import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BOOK_APP_ROOT = join(__dirname, "../../../app/book");

const ALLOWED_RELATIVE_PATHS = new Set([
  "continue/page.tsx",
  "l/[linkSlug]/page.tsx",
  "on-demand/result/page.tsx",
  "on-demand/waiting/page.tsx",
  "[providerSlug]/page.tsx",
]);

function listRelativeFiles(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listRelativeFiles(join(dir, entry.name), rel));
    } else if (entry.isFile()) {
      out.push(rel.replace(/\\/g, "/"));
    }
  }
  return out;
}

describe("WS8 — legacy /book shim tree", () => {
  it("has no express components tree under app/book", () => {
    expect(existsSync(join(BOOK_APP_ROOT, "components"))).toBe(false);
    expect(existsSync(join(BOOK_APP_ROOT, "[providerSlug]/book-provider-client.tsx"))).toBe(
      false,
    );
  });

  it("only contains redirect/resolver pages", () => {
    const files = listRelativeFiles(BOOK_APP_ROOT);
    expect(files.length).toBe(ALLOWED_RELATIVE_PATHS.size);
    for (const f of files) {
      expect(ALLOWED_RELATIVE_PATHS.has(f)).toBe(true);
    }
  });
});
