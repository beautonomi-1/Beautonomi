import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Portal tokens are not listed to every signed-in session", () => {
  it("drops the policy that reads every active token", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10172_portal_token_lookup_policy.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS "Portal tokens can be read by token value" ON public\.portal_tokens/,
    );
    expect(sql).not.toMatch(/CREATE POLICY/);
    expect(sql).not.toMatch(/is_active = true AND expires_at/);
    expect(sql).not.toMatch(/service_role/);
  });
});
