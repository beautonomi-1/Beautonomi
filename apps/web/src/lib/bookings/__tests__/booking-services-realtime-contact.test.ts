import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function publishedColumns(sql: string): string {
  const marker = "ADD TABLE public.booking_services (";
  const start = sql.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const open = sql.indexOf("(", start);
  const close = sql.indexOf(");", open);
  return sql.slice(open + 1, close);
}

describe("10151 booking service realtime contact", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "../../supabase/migrations/10151_booking_services_realtime_omit_contact.sql"),
    "utf8",
  );

  it("publishes the service line and omits guest email and phone", () => {
    const columns = publishedColumns(sql);
    expect(columns).toMatch(/\bid\b/);
    expect(columns).toMatch(/\bbooking_id\b/);
    expect(columns).toMatch(/\bstaff_id\b/);
    expect(columns).toMatch(/\bguest_name\b/);
    expect(columns).toMatch(/\bscheduled_start_at\b/);
    expect(columns).not.toMatch(/\bguest_email\b/);
    expect(columns).not.toMatch(/\bguest_phone\b/);
    expect(sql).toContain("REPLICA IDENTITY DEFAULT");
  });
});
