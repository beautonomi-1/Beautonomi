import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Yoco checkout secrets are not readable by a signed-in session", () => {
  it("grants the integration and omits the checkout and webhook secrets", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10167_yoco_checkout_secret_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.provider_yoco_integrations FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bid\b/);
    expect(grant).toMatch(/\bpublic_key\b/);
    expect(grant).toMatch(/\bis_enabled\b/);
    expect(grant).not.toMatch(/\bsecret_key\b/);
    expect(grant).not.toMatch(/\bwebhook_secret\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
