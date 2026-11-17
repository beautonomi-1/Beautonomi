import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Yoco webhook secrets are not readable by a signed-in session", () => {
  it("grants the webhook row and omits the secret", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10170_yoco_webhook_secret_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.provider_yoco_webhooks FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bid\b/);
    expect(grant).toMatch(/\bwebhook_id\b/);
    expect(grant).toMatch(/\bcallback_url\b/);
    expect(grant).not.toMatch(/\bwebhook_secret\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
