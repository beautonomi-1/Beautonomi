import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COLUMNS =
  "id, provider_id, provider, calendar_id, calendar_name, ical_url, sync_direction, is_active, last_sync_at, sync_error, metadata, created_at, updated_at";

describe("Calendar sync tokens are not readable by a signed-in session", () => {
  it("grants the sync row and omits the OAuth tokens", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/10168_calendar_sync_secret_column_select.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /REVOKE SELECT ON TABLE public.calendar_syncs FROM PUBLIC, anon, authenticated/,
    );
    const grant = sql.slice(sql.indexOf("GRANT SELECT ("));
    expect(grant).toMatch(/TO anon, authenticated/);
    expect(grant).toMatch(/\bid\b/);
    expect(grant).toMatch(/\bcalendar_id\b/);
    expect(grant).toMatch(/\bical_url\b/);
    expect(grant).not.toMatch(/\baccess_token\b/);
    expect(grant).not.toMatch(/\brefresh_token\b/);
    expect(sql).not.toMatch(/service_role/);
  });

  it("does not return the OAuth tokens from the calendar sync routes", () => {
    const list = readFileSync(
      resolve(process.cwd(), "src/app/api/provider/calendar/sync/route.ts"),
      "utf8",
    );
    const detail = readFileSync(
      resolve(process.cwd(), "src/app/api/provider/calendar/sync/[id]/route.ts"),
      "utf8",
    );
    expect(list).toContain(`.select("${COLUMNS}")`);
    expect(list).not.toMatch(/\.select\(\s*"\*"\s*\)/);
    expect(list).not.toMatch(/\.select\(\s*\)/);
    expect(detail).toContain(`.select("${COLUMNS}")`);
    expect(detail).not.toMatch(/\.select\(\s*"\*"\s*\)/);
    expect(detail).not.toMatch(/\.select\(\s*\)/);
  });
});
