import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Terminal vendor secrets are not readable by a signed-in session", () => {
  it("grants the vendor config and omits the OAuth client secret", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10171_terminal_vendor_secret_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.terminal_vendor_configs FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bid\b/);
    expect(grant).toMatch(/\bvendor\b/);
    expect(grant).toMatch(/\boauth_client_id\b/);
    expect(grant).not.toMatch(/\boauth_client_secret\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
