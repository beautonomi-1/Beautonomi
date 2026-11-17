import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Yoco account contact is not readable by a signed-in session", () => {
  it("grants the connection and omits the account email", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10158_yoco_oauth_contact_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.provider_yoco_oauth_tokens FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bid\b/);
    expect(grant).toMatch(/\bprovider_id\b/);
    expect(grant).toMatch(/\bbusiness_name\b/);
    expect(grant).not.toMatch(/\buser_email\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
