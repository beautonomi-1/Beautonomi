/**
 * Part L — static RBAC negative matrix.
 * Superadmin-only mutation routes must call requireSuperadmin / requireSuperadminPlatform.
 * Finance mutation routes must gate on ADMIN_SECTION_FINANCE.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WEB = join(__dirname, "../../..");

const SUPERADMIN_MUTATIONS = [
  "app/api/admin/finance/ledger-repair/[id]/approve/route.ts",
  "app/api/admin/finance/ledger-repair/[id]/reject/route.ts",
];

const FINANCE_MUTATIONS = [
  "app/api/admin/reconciliation-exceptions/[id]/assign/route.ts",
  "app/api/admin/reconciliation-exceptions/[id]/resolve/route.ts",
  "app/api/admin/finance/ledger-repair/propose/route.ts",
  "app/api/admin/finance/ledger-repair/route.ts",
  "app/api/admin/finance/ledger-health/route.ts",
];

describe("admin RBAC negative matrix (Part L)", () => {
  it("ledger-repair approve/reject require superadmin (not finance-only)", () => {
    for (const rel of SUPERADMIN_MUTATIONS) {
      const abs = join(WEB, rel);
      expect(existsSync(abs), rel).toBe(true);
      const src = readFileSync(abs, "utf8");
      expect(src).toMatch(/requireSuperadmin/);
    }
  });

  it("finance ops mutations require ADMIN_SECTION_FINANCE", () => {
    for (const rel of FINANCE_MUTATIONS) {
      const abs = join(WEB, rel);
      expect(existsSync(abs), rel).toBe(true);
      const src = readFileSync(abs, "utf8");
      expect(src).toContain("ADMIN_SECTION_FINANCE");
      expect(src).toMatch(/requireAdminSection/);
    }
  });

  it("inbound webhook replay is finance or integrations, not open", () => {
    const src = readFileSync(join(WEB, "app/api/admin/webhooks/inbound/[id]/replay/route.ts"), "utf8");
    expect(src).toMatch(/requireAdminSectionAny/);
    expect(src).toContain("ADMIN_SECTION_FINANCE");
  });
});
