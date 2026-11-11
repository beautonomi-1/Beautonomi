import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("gift card recipient contact is not readable by a signed-in session", () => {
  it("grants the order and omits the recipient address and the stored metadata", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10155_gift_card_order_contact_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.gift_card_orders FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bid\b/);
    expect(grant).toMatch(/\bpurchaser_user_id\b/);
    expect(grant).toMatch(/\bdeliver_at\b/);
    expect(grant).not.toMatch(/\brecipient_email\b/);
    expect(grant).not.toMatch(/\brecipient_phone\b/);
    expect(grant).not.toMatch(/\bmetadata\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
