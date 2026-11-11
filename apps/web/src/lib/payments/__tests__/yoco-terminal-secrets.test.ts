import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Yoco terminal secrets are not readable by a signed-in session", () => {
  it("grants the terminal and omits the device keys", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10169_yoco_terminal_secret_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.provider_yoco_terminals FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bid\b/);
    expect(grant).toMatch(/\bdevice_id\b/);
    expect(grant).toMatch(/\bdevice_name\b/);
    expect(grant).not.toMatch(/\bapi_key\b/);
    expect(grant).not.toMatch(/\bsecret_key\b/);
    expect(sql).not.toMatch(/service_role/);
  });

  it("does not return the device keys from the terminal update", () => {
    const detail = readFileSync(
      resolve(process.cwd(), "src/app/api/provider/yoco/devices/[id]/route.ts"),
      "utf8",
    );
    expect(detail).toContain(
      '.select("id, device_id, device_name, location_name, active, created_at")',
    );
    expect(detail).not.toMatch(
      /from\("provider_yoco_terminals"\)[\s\S]{0,240}\.select\(\s*\)/,
    );
  });
});
