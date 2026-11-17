import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("booking service contact is not readable by a signed-in session", () => {
  it("grants the service line and the guest name, and omits email and phone", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10152_booking_service_contact_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.booking_services FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bid\b/);
    expect(grant).toMatch(/\bguest_name\b/);
    expect(grant).toMatch(/\bstaff_id\b/);
    expect(grant).toMatch(/\bscheduled_start_at\b/);
    expect(grant).not.toMatch(/\bguest_email\b/);
    expect(grant).not.toMatch(/\bguest_phone\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
