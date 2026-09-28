import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Canonical Brand desk admin API tree (App Router file paths under app/api/admin/brand).
 * UI and integrations should only call routes listed here.
 */
const BRAND_ADMIN_API_ROUTES = [
  "briefs/route.ts",
  "briefs/[id]/route.ts",
  "briefs/[id]/review/route.ts",
  "campaigns/route.ts",
  "campaigns/[id]/route.ts",
  "campaigns/[id]/stage/route.ts",
  "campaigns/[id]/readiness/route.ts",
  "campaigns/[id]/pdf/route.ts",
  "campaigns/[id]/placements/route.ts",
  "campaigns/[id]/placements/bulk/route.ts",
  "briefs/[id]/pdf/route.ts",
  "approvals/[id]/decide/route.ts",
  "approvals/[id]/guest-link/route.ts",
  "strategy/route.ts",
  "strategy/pillars/route.ts",
  "strategy/plans/route.ts",
  "pack/pdf/route.ts",
  "campaigns/[id]/clone/route.ts",
  "campaigns/[id]/audience/route.ts",
  "campaigns/[id]/metrics/route.ts",
  "placements/[id]/route.ts",
  "metrics/route.ts",
  "metrics/parse-csv/route.ts",
  "weekly-update/route.ts",
  "my-work/route.ts",
  "marketing-admins/route.ts",
  "settings/route.ts",
  "pack/route.ts",
  "pack/all/route.ts",
  "pack/export/route.ts",
  "evidence-pack/route.ts",
  "evidence-pack/[id]/build/route.ts",
  "evidence-pack/[id]/download-url/route.ts",
  "assets/upload-url/route.ts",
  "assets/confirm/route.ts",
  "campaigns/[id]/assets/route.ts",
  "asset-versions/[versionId]/signed-url/route.ts",
  "asset-versions/[versionId]/proof-comments/route.ts",
  "briefs/[id]/autosave/route.ts",
  "briefs/[id]/versions/route.ts",
  "briefs/[id]/copilot-assist/route.ts",
  "briefs/[id]/schema/route.ts",
] as const;

const ADMIN_CLIENT_PATHS = [
  "/api/admin/brand/briefs",
  "/api/admin/brand/campaigns",
  "/api/admin/brand/my-work",
  "/api/admin/brand/marketing-admins",
  "/api/admin/brand/weekly-update",
  "/api/admin/brand/metrics",
  "/api/admin/brand/metrics/parse-csv",
  "/api/admin/brand/settings",
  "/api/admin/brand/pack",
  "/api/admin/brand/pack/all",
  "/api/admin/brand/pack/export",
] as const;

describe("brand desk API taxonomy", () => {
  const apiRoot = join(process.cwd(), "src/app/api/admin/brand");

  it("implements every canonical route file", () => {
    const missing = BRAND_ADMIN_API_ROUTES.filter((rel) => !existsSync(join(apiRoot, rel)));
    expect(missing, `Missing route files: ${missing.join(", ")}`).toEqual([]);
  });

  it("documents stable client path prefixes used by admin-web", () => {
    for (const p of ADMIN_CLIENT_PATHS) {
      expect(p.startsWith("/api/admin/brand/")).toBe(true);
    }
    expect(BRAND_ADMIN_API_ROUTES.length).toBeGreaterThanOrEqual(ADMIN_CLIENT_PATHS.length);
  });
});
