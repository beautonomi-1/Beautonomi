import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Twilio credentials are not readable by a signed-in session", () => {
  it("grants the integration and omits the credentials and the sender numbers", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10165_twilio_secret_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.provider_twilio_integrations FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bid\b/);
    expect(grant).toMatch(/\bis_sms_enabled\b/);
    expect(grant).toMatch(/\bis_whatsapp_enabled\b/);
    expect(grant).not.toMatch(/\baccount_sid\b/);
    expect(grant).not.toMatch(/\bauth_token\b/);
    expect(grant).not.toMatch(/\bsms_from_number\b/);
    expect(grant).not.toMatch(/\bwhatsapp_from_number\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
