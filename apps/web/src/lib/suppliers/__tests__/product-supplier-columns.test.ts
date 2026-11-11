import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("supplier contact is not readable by a signed-in session", () => {
  it("grants the supplier and omits email and phone", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10157_product_supplier_contact_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.product_suppliers FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bid\b/);
    expect(grant).toMatch(/\bname\b/);
    expect(grant).toMatch(/\bcontact_name\b/);
    expect(grant).not.toMatch(/\bemail\b/);
    expect(grant).not.toMatch(/\bphone\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
