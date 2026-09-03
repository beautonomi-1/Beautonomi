/**
 * Part F2 — every provider mutation route must call a permission / role helper.
 * Allowlist is for read-only self endpoints or routes that only export GET.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PROVIDER_API = join(__dirname, "../../../app/api/provider");

const PERMISSION_HELPER =
  /requirePermission|requireAnyPermission|requireRoleInApi|requireRole\b|requireOwner/;

/**
 * External callbacks, invite/onboarding, cron-invoked executors, and signed-URL
 * minting. These authenticate by HMAC, cron secret, invite token, or session
 * ownership rather than a staff permission key.
 */
const MUTATION_ALLOWLIST = new Set([
  "ads/orders/[id]/receipt/signed-url/route.ts",
  "automations/execute/route.ts",
  "conversations/create/route.ts",
  "group-bookings/[id]/receipt/signed-url/route.ts",
  "invoices/[id]/signed-url/route.ts",
  "memberships/leave/route.ts",
  "onboarding/draft/route.ts",
  "onboarding/invite/redeem/route.ts",
  "paycloud/webhook/route.ts",
  "product-orders/[id]/receipt/signed-url/route.ts",
  "sales/[id]/receipt/signed-url/route.ts",
  "staff/join/accept/route.ts",
  "subscription/receipts/[financeTxId]/signed-url/route.ts",
  "terminal-orders/[id]/receipt/signed-url/route.ts",
  "upgrade-to-salon/route.ts",
  "yoco/webhook/route.ts",
]);

/** Mutations that must use requirePermission / requireAnyPermission (not membership-only). */
const MUST_REQUIRE_PERMISSION = [
  "payments/route.ts",
  "invoices/route.ts",
  "payouts/statements/route.ts",
  "payouts/next-date/route.ts",
  "campaigns/route.ts",
  "promotions/route.ts",
  "packages/[id]/route.ts",
  "services/[id]/variants/route.ts",
  "staff/[id]/bookings/route.ts",
  "paycloud/terminals/route.ts",
  "finance/vat-reports/[id]/mark-remitted/route.ts",
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (entry.name === "route.ts") acc.push(p);
  }
  return acc;
}

function hasMutation(src: string): boolean {
  return /export async function (POST|PUT|PATCH|DELETE)\b/.test(src);
}

describe("provider route permissions (Part F2)", () => {
  const files = walk(PROVIDER_API);
  expect(files.length).toBeGreaterThan(50);

  it("F2 membership-only routes now call requirePermission / requireAnyPermission", () => {
    for (const rel of MUST_REQUIRE_PERMISSION) {
      const abs = join(PROVIDER_API, rel);
      if (!existsSync(abs)) continue;
      const src = readFileSync(abs, "utf8");
      expect(
        /requirePermission|requireAnyPermission/.test(src),
        `${rel} must call requirePermission or requireAnyPermission`,
      ).toBe(true);
    }
  });

  it("every provider mutation route calls a role or permission helper", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!hasMutation(src)) continue;
      const rel = file.slice(PROVIDER_API.length + 1).replace(/\\/g, "/");
      if (MUTATION_ALLOWLIST.has(rel)) continue;
      if (!PERMISSION_HELPER.test(src)) {
        offenders.push(rel);
      }
    }
    expect(offenders, `mutations missing a permission helper:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("staff service routes do not reference the phantom staff_service_assignments table", () => {
    for (const rel of ["staff/route.ts", "staff/[id]/route.ts", "staff/[id]/services/route.ts"]) {
      const src = readFileSync(join(PROVIDER_API, rel), "utf8");
      expect(src).not.toContain("staff_service_assignments");
    }
  });
});
