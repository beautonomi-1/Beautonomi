import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("brand approval guest contact is not readable by a signed-in session", () => {
  it("grants the approval and omits the guest address", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10156_brand_approval_contact_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.brand_approvals FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bid\b/);
    expect(grant).toMatch(/\bapprover_id\b/);
    expect(grant).toMatch(/\bstatus\b/);
    expect(grant).not.toMatch(/\bguest_email\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
