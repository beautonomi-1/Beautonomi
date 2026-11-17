import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("virtual terminal contact is not readable by a signed-in session", () => {
  it("grants the terminal and omits the WhatsApp number and the owner snapshot", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10160_virtual_terminal_contact_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.provider_paystack_virtual_terminals FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bid\b/);
    expect(grant).toMatch(/\bterminal_code\b/);
    expect(grant).toMatch(/\bnotification_whatsapp_label\b/);
    expect(grant).not.toMatch(/\bnotification_whatsapp\b/);
    expect(grant).not.toMatch(/\bbusiness_snapshot\b/);
    expect(grant).not.toMatch(/\bdestinations\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
