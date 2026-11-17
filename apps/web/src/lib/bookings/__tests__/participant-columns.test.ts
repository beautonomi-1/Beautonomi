import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PARTICIPANT_COLUMNS_WITHOUT_CONTACT } from "../participant-columns";

describe("booking participant contact is not readable by a signed-in session", () => {
  it("omits email and phone from the session column list", () => {
    expect(PARTICIPANT_COLUMNS_WITHOUT_CONTACT).toMatch(/\bid\b/);
    expect(PARTICIPANT_COLUMNS_WITHOUT_CONTACT).toMatch(/\bparticipant_name\b/);
    expect(PARTICIPANT_COLUMNS_WITHOUT_CONTACT).toMatch(/\bparticipant_payment_status\b/);
    expect(PARTICIPANT_COLUMNS_WITHOUT_CONTACT).not.toMatch(/\bparticipant_email\b/);
    expect(PARTICIPANT_COLUMNS_WITHOUT_CONTACT).not.toMatch(/\bparticipant_phone\b/);
  });

  it("grants the other columns to anon and authenticated and leaves the service role", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10150_booking_participant_contact_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.booking_participants FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).not.toMatch(/\bparticipant_email\b/);
    expect(grant).not.toMatch(/\bparticipant_phone\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
