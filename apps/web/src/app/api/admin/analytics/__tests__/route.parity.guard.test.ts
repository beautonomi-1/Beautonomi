import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(__dirname, "..", "route.ts"), "utf8");

describe("admin analytics route report parity guards", () => {
  it("pages scheduled bookings like the bookings report (admin + cap + lte now)", () => {
    expect(routeSource).toContain('admin\n            .from("bookings")');
    expect(routeSource).toContain("MAX_BOOKINGS_FOR_REPORT");
    expect(routeSource).toContain('.lte("scheduled_at", now.toISOString())');
    expect(routeSource).toContain("buildBookingStatusBreakdown");
  });

  it("uses admin ledger fetch like the revenue report", () => {
    expect(routeSource).toContain("fetchFinanceLedgerRowsForTenant(admin, tenantId");
    expect(routeSource).toContain("platformRevenueNetFromAggregate");
  });
});
