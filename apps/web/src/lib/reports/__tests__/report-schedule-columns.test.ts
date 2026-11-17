import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("scheduled report recipients are not readable by a signed-in session", () => {
  it("grants the schedule and omits the recipient list", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10159_report_schedule_contact_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.report_schedules FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bid\b/);
    expect(grant).toMatch(/\breport_type\b/);
    expect(grant).toMatch(/\bis_active\b/);
    expect(grant).not.toMatch(/\brecipients\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
