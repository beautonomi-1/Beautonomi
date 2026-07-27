import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matchPath } from "react-router";
import { extractSpaRoutePatternsFromAppTsx } from "./extractSpaRoutesFromAppTsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "..");

function collectSourceFiles(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      collectSourceFiles(p, out);
    } else if (name.endsWith(".tsx") || name.endsWith(".ts")) {
      if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
      if (name === "adminSpaPath.ts") continue;
      out.push(p);
    }
  }
}

function adminPathToRelative(href: string): string {
  let p = href.trim();
  if (!p.startsWith("/admin")) return p;
  return p.replace(/^\/admin\/?/, "").split("?")[0].replace(/\/+$/, "");
}

function matchesRegistry(pathname: string, patterns: readonly string[]): boolean {
  const p = pathname.replace(/^\/+|\/+$/g, "");
  if (patterns.includes(p)) return true;
  const loc = p.startsWith("/") ? p : `/${p}`;
  return patterns.some((pattern) => {
    const pat = pattern.startsWith("/") ? pattern : `/${pattern}`;
    return matchPath({ path: pat, end: true }, loc) != null;
  });
}

describe("SPA in-app /admin links vs App.tsx routes", () => {
  const appSrc = readFileSync(join(srcRoot, "App.tsx"), "utf8");
  const patterns = extractSpaRoutePatternsFromAppTsx(appSrc);

  it("extractor finds control-plane and marketing routes", () => {
    expect(patterns).toContain("dashboard");
    expect(patterns).toContain("control-plane/feature-flags");
    expect(patterns).toContain("control-plane/compliance");
    expect(patterns).toContain("gamification/operations");
    expect(patterns).toContain("providers/distance-settings");
  });

  it("every static adminSpaTo(\"/admin/...\") string resolves to a registered route", () => {
    const files: string[] = [];
    collectSourceFiles(srcRoot, files);
    const re = /adminSpaTo\(\s*["'](\/admin\/[^'"]+)["']\s*\)/g;
    const misses: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const rel = adminPathToRelative(m[1]);
        if (!matchesRegistry(rel, patterns)) {
          misses.push(`${file}:${rel}`);
        }
      }
    }

    expect(misses, `Unregistered static targets:\n${misses.join("\n")}`).toEqual([]);
  });

  it('every object literal to: "/admin/..." resolves to a registered route', () => {
    const files: string[] = [];
    collectSourceFiles(srcRoot, files);
    const re = /to:\s*["'](\/admin\/[^'"]+)["']/g;
    const misses: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const rel = adminPathToRelative(m[1]);
        if (!matchesRegistry(rel, patterns)) {
          misses.push(`${file}:${rel}`);
        }
      }
    }

    expect(misses, `Unregistered to: targets:\n${misses.join("\n")}`).toEqual([]);
  });
});
