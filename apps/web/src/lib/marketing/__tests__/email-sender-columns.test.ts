import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("email sender address is not readable by a signed-in session", () => {
  it("grants the integration and omits the sending address", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10163_email_sender_contact_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.provider_email_integrations FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bid\b/);
    expect(grant).toMatch(/\bfrom_name\b/);
    expect(grant).toMatch(/\bis_enabled\b/);
    expect(grant).not.toMatch(/\bfrom_email\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
