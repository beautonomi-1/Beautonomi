import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "..");

/**
 * Every sidebar `href` in `config/nav.ts` must resolve in `App.tsx` so users never hit 404 from the shell.
 * Special cases: control-plane subtree, legacy redirects.
 */
function navHrefPaths(): string[] {
  const nav = readFileSync(join(srcRoot, "config", "nav.ts"), "utf8");
  const hrefs = [...nav.matchAll(/href:\s*"\/admin\/([^"]+)"/g)].map((m) => m[1].replace(/\/$/, ""));
  return [...new Set(hrefs)];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function appRegistersPath(adminRelPath: string, appSrc: string): boolean {
  if (adminRelPath === "custom-fields") {
    return (
      new RegExp(`path="${escapeRe("custom-fields")}"`).test(appSrc) ||
      appSrc.includes("settings/custom-fields")
    );
  }

  if (adminRelPath.startsWith("control-plane/")) {
    const child = adminRelPath.slice("control-plane/".length);
    return (
      appSrc.includes('path="control-plane"') && new RegExp(`path="${escapeRe(child)}"`).test(appSrc)
    );
  }

  return new RegExp(`path="${escapeRe(adminRelPath)}"`).test(appSrc);
}

describe("sidebar nav ↔ App.tsx routes", () => {
  const appSrc = readFileSync(join(srcRoot, "App.tsx"), "utf8");

  it.each(navHrefPaths())("nav href /admin/%s is registered", (p) => {
    expect(appRegistersPath(p, appSrc), `Missing route for /admin/${p}`).toBe(true);
  });
});
