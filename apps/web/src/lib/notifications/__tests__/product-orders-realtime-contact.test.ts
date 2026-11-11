import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function publishedColumns(sql: string): string {
  const marker = "ADD TABLE public.product_orders (";
  const start = sql.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const open = sql.indexOf("(", start);
  const close = sql.indexOf(");", open);
  return sql.slice(open + 1, close);
}

describe("10147 product order realtime contact", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "../../supabase/migrations/10147_product_orders_realtime_omit_contact.sql"),
    "utf8",
  );

  it("publishes the order alert fields and omits customer email and phone", () => {
    const columns = publishedColumns(sql);
    expect(columns).toMatch(/\bpayment_status\b/);
    expect(columns).toMatch(/\bprovider_id\b/);
    expect(columns).toMatch(/\border_number\b/);
    expect(columns).toMatch(/\bstatus\b/);
    expect(columns).toMatch(/\border_source\b/);
    expect(columns).toMatch(/\bcustomer_name\b/);
    expect(columns).not.toMatch(/\bcustomer_email\b/);
    expect(columns).not.toMatch(/\bcustomer_phone\b/);
    expect(sql).toContain("REPLICA IDENTITY USING INDEX product_orders_realtime_identity");
  });
});
