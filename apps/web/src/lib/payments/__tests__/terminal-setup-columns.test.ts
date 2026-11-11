import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("terminal setup contact is not readable by a signed-in session", () => {
  it("grants the request and omits the WhatsApp number", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10161_terminal_setup_contact_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.provider_paystack_virtual_terminal_setup_requests FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bid\b/);
    expect(grant).toMatch(/\bstatus\b/);
    expect(grant).toMatch(/\bdestination_name\b/);
    expect(grant).not.toMatch(/\bdestination_target\b/);
    expect(grant).not.toMatch(/\bdestinations\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
