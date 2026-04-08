import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CRITICAL_ADMIN_FLOWS } from "./criticalFlows";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appTsxPath = join(__dirname, "../App.tsx");

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches a flat `path="a/b"` or nested control-plane child `path="control-plane"` … `path="b/c"`. */
function routeRegisteredInApp(appSource: string, appPath: string): boolean {
  if (appSource.includes(`path="${appPath}"`) || appSource.includes(`path='${appPath}'`)) {
    return true;
  }
  if (appPath.startsWith("control-plane/")) {
    const child = appPath.slice("control-plane/".length);
    const re = new RegExp(`path=["']control-plane["'][\\s\\S]*?path=["']${escapeRe(child)}["']`);
    return re.test(appSource);
  }
  return false;
}

describe("admin route smoke (critical flows)", () => {
  const appSource = readFileSync(appTsxPath, "utf8");

  it.each(CRITICAL_ADMIN_FLOWS.filter((f) => f.appPath !== "login"))(
    "App registers route path $appPath ($id)",
    ({ appPath, id }) => {
      expect(
        routeRegisteredInApp(appSource, appPath),
        `missing Route for ${appPath} (${id})`
      ).toBe(true);
    }
  );

  it("App registers login route", () => {
    expect(appSource).toMatch(/path=["']login["']/);
  });
});
