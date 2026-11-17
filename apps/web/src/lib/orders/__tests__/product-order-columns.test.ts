import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PRODUCT_ORDER_COLUMNS_WITHOUT_CONTACT } from "../product-order-columns";

describe("product order contact is not readable by a signed-in session", () => {
  it("omits email and phone from the session column list", () => {
    expect(PRODUCT_ORDER_COLUMNS_WITHOUT_CONTACT).toMatch(/\bid\b/);
    expect(PRODUCT_ORDER_COLUMNS_WITHOUT_CONTACT).toMatch(/\bcustomer_name\b/);
    expect(PRODUCT_ORDER_COLUMNS_WITHOUT_CONTACT).toMatch(/\bpayment_status\b/);
    expect(PRODUCT_ORDER_COLUMNS_WITHOUT_CONTACT).not.toMatch(/\bcustomer_email\b/);
    expect(PRODUCT_ORDER_COLUMNS_WITHOUT_CONTACT).not.toMatch(/\bcustomer_phone\b/);
  });

  it("revokes the column read from anon and authenticated and leaves the service role", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10148_product_order_contact_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/REVOKE SELECT ON TABLE public.product_orders FROM PUBLIC, anon, authenticated/);
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).not.toMatch(/\bcustomer_email\b/);
    expect(grant).not.toMatch(/\bcustomer_phone\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
