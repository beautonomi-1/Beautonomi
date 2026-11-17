import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WAITLIST_COLUMNS_WITHOUT_CONTACT } from "../waitlist-columns";

describe("waitlist contact is not readable by a signed-in session", () => {
  it("omits email and phone from the session column list", () => {
    expect(WAITLIST_COLUMNS_WITHOUT_CONTACT).toMatch(/\bid\b/);
    expect(WAITLIST_COLUMNS_WITHOUT_CONTACT).toMatch(/\bcustomer_name\b/);
    expect(WAITLIST_COLUMNS_WITHOUT_CONTACT).toMatch(/\bstatus\b/);
    expect(WAITLIST_COLUMNS_WITHOUT_CONTACT).not.toMatch(/\bcustomer_email\b/);
    expect(WAITLIST_COLUMNS_WITHOUT_CONTACT).not.toMatch(/\bcustomer_phone\b/);
  });

  it("grants the other columns to anon and authenticated and leaves the service role", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "../../supabase/migrations/10149_waitlist_contact_column_select.sql"),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.waitlist_entries FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).not.toMatch(/\bcustomer_email\b/);
    expect(grant).not.toMatch(/\bcustomer_phone\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
