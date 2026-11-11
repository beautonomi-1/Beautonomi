import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TERMINAL_PAYMENT_COLUMNS_WITHOUT_CONTACT } from "../terminal-payment-columns";

describe("terminal payment contact is not readable by a signed-in session", () => {
  it("omits the payer address and the raw charge from the session column list", () => {
    expect(TERMINAL_PAYMENT_COLUMNS_WITHOUT_CONTACT).toMatch(/\bid\b/);
    expect(TERMINAL_PAYMENT_COLUMNS_WITHOUT_CONTACT).toMatch(/\bpayer_name\b/);
    expect(TERMINAL_PAYMENT_COLUMNS_WITHOUT_CONTACT).toMatch(/\bprovider_id\b/);
    expect(TERMINAL_PAYMENT_COLUMNS_WITHOUT_CONTACT).not.toMatch(/\bpayer_email\b/);
    expect(TERMINAL_PAYMENT_COLUMNS_WITHOUT_CONTACT).not.toMatch(/\bpayer_phone\b/);
    expect(TERMINAL_PAYMENT_COLUMNS_WITHOUT_CONTACT).not.toMatch(/\braw_payload\b/);
  });

  it("grants the other columns to anon and authenticated and leaves the service role", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10154_terminal_payment_contact_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.provider_paystack_terminal_payments FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bpayer_name\b/);
    expect(grant).not.toMatch(/\bpayer_email\b/);
    expect(grant).not.toMatch(/\bpayer_phone\b/);
    expect(grant).not.toMatch(/\braw_payload\b/);
    expect(sql).not.toMatch(/service_role/);
  });
});
