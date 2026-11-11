import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function publishedColumns(sql: string): string {
  const marker = "ADD TABLE public.provider_paystack_terminal_payments (";
  const start = sql.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const open = sql.indexOf("(", start);
  const close = sql.indexOf(");", open);
  return sql.slice(open + 1, close);
}

describe("10153 terminal payment realtime contact", () => {
  const sql = readFileSync(
    resolve(
      process.cwd(),
      "../../supabase/migrations/10153_terminal_payment_realtime_omit_contact.sql",
    ),
    "utf8",
  );

  it("publishes the payment alert and omits the payer address and the raw charge", () => {
    const columns = publishedColumns(sql);
    expect(columns).toMatch(/\bprovider_id\b/);
    expect(columns).toMatch(/\bpaystack_reference\b/);
    expect(columns).toMatch(/\bpaid_amount\b/);
    expect(columns).toMatch(/\bpayer_name\b/);
    expect(columns).toMatch(/\bmatch_candidates\b/);
    expect(columns).not.toMatch(/\bpayer_email\b/);
    expect(columns).not.toMatch(/\bpayer_phone\b/);
    expect(columns).not.toMatch(/\braw_payload\b/);
    expect(sql).toContain("REPLICA IDENTITY DEFAULT");
  });
});
