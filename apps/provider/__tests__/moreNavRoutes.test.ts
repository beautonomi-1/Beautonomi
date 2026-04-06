/**
 * Ensures More-tab menu routes and report catalog native targets resolve to real Expo Router files.
 * Prevents 404 / unmatched routes when hub links drift.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const moreDir = join(root, "app", "(app)", "(tabs)", "more");
const reportsDir = join(moreDir, "reports");

function moreScreenExists(segment: string): boolean {
  if (!segment || segment.includes("..")) return false;
  const file = join(moreDir, `${segment}.tsx`);
  const index = join(moreDir, segment, "index.tsx");
  return existsSync(file) || existsSync(index);
}

function extractMoreRoutesFromIndex(): string[] {
  const src = readFileSync(join(moreDir, "index.tsx"), "utf8");
  const matches = [...src.matchAll(/route:\s*"\/\(app\)\/\(tabs\)\/more\/([^"]+)"/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

function extractReportCatalogTargets(): { nativeScreens: string[]; appRoutes: string[] } {
  const src = readFileSync(join(reportsDir, "reportCatalog.tsx"), "utf8");
  const nativeScreens: string[] = [];
  const blocks = src.split(/target:\s*"native"/);
  for (let i = 1; i < blocks.length; i++) {
    const m = blocks[i].match(/screen:\s*"([^"]+)"/);
    if (m) nativeScreens.push(m[1]);
  }
  const appRoutes: string[] = [];
  const routeBlocks = src.split(/target:\s*"route"/);
  for (let i = 1; i < routeBlocks.length; i++) {
    const m = routeBlocks[i].match(/route:\s*"([^"]+)"/);
    if (m) appRoutes.push(m[1]);
  }
  return { nativeScreens, appRoutes };
}

describe("Provider app — More tab route integrity", () => {
  it("every menu / quick-action route in more/index.tsx has a matching screen file", () => {
    const segments = extractMoreRoutesFromIndex();
    expect(segments.length).toBeGreaterThan(0);
    for (const seg of segments) {
      if (!moreScreenExists(seg)) {
        throw new Error(`Missing screen for /more/${seg} (add ${seg}.tsx or ${seg}/index.tsx)`);
      }
    }
  });

  it("every native report target in reportCatalog maps to reports/*.tsx", () => {
    const { nativeScreens } = extractReportCatalogTargets();
    expect(nativeScreens.length).toBeGreaterThan(0);
    for (const screen of nativeScreens) {
      const f = join(reportsDir, `${screen}.tsx`);
      if (!existsSync(f)) {
        throw new Error(`Missing reports/${screen}.tsx for native report target`);
      }
    }
  });

  it("every route-target report in reportCatalog points at an existing more/*.tsx", () => {
    const { appRoutes } = extractReportCatalogTargets();
    for (const full of appRoutes) {
      const prefix = "/(app)/(tabs)/more/";
      if (!full.startsWith(prefix)) {
        throw new Error(`Expected route under more/: ${full}`);
      }
      const seg = full.slice(prefix.length);
      if (!moreScreenExists(seg)) {
        throw new Error(`Missing screen for report route ${full}`);
      }
    }
  });
});
