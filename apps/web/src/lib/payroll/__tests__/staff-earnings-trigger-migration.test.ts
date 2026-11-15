import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("staff earnings trigger", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "..", "supabase", "migrations", "10174_staff_earnings_lines_conflict_target.sql"),
    "utf8",
  );

  it("matches the unique index, so a payment can save the commission line", () => {
    expect(sql).toContain(
      "(COALESCE(booking_service_id, '00000000-0000-0000-0000-000000000000'::uuid))",
    );
    expect(sql).not.toContain("ON CONFLICT (source_finance_transaction_id, staff_id, kind)");
  });

  it("keeps appointment retail out of the service commission", () => {
    expect(sql).toContain("v_service_pool := NEW.amount - COALESCE(v_retail, 0)");
    expect(sql).toContain("'product_commission'");
  });
});
