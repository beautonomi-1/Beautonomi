import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ALL_BOOKING_STATUS_VALUES, type BookingStatus } from "../../lib/utils/booking-status";

/**
 * Guards against drift between booking_status enum (DB) and literals used in TS code.
 *
 * 1. The canonical application list is `ALL_BOOKING_STATUS_VALUES`.
 * 2. Any literal that appears in a `.eq("status", "...")` / `.in("status", [...])`
 *    chained directly off `from("bookings")` or `from("booking_...")` must be a
 *    member of the enum. Generic `.eq("status", "active")` on other tables
 *    (providers, services, staff, campaigns, etc.) is intentionally ignored —
 *    those tables have their own status vocabularies.
 * 3. The DB enum is extended by migration 487 to include `pending_payment`.
 */
describe("booking_status enum contract", () => {
  it("pending_payment is included (added by migration 487)", () => {
    expect(ALL_BOOKING_STATUS_VALUES).toContain("pending_payment" satisfies BookingStatus);
  });

  it("no TS code uses a booking status literal outside the enum list", () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const apiDir = path.join(repoRoot, "src", "app", "api");
    const files: string[] = [];
    function walk(dir: string): void {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          files.push(full);
        }
      }
    }
    walk(apiDir);

    const allowed = new Set<string>(ALL_BOOKING_STATUS_VALUES);
    const offenders: Array<{ file: string; literal: string; context: string }> = [];

    // For every `.eq("status", "...")` / `.in("status", [...])`, look BACKWARDS
    // at the most recent table selector in the same expression — either
    // `.from("tbl")` or a `<name>Table(` helper. We only flag the literal if
    // the resolved table is the bookings enum family. This keeps provider /
    // service / campaign status columns (which have their own vocabularies)
    // out of the report.
    const statusCallRe =
      /\.(eq|in)\(\s*["']status["']\s*,\s*(?:["']([^"']+)["']|\[([^\]]+)\])\s*\)/g;
    const BOOKING_TABLES = new Set([
      "bookings",
      "booking_services",
      "booking_events",
      "booking_addons",
      "booking_state_transitions",
      "booking_holds",
    ]);
    // Helper functions in this repo that return a Supabase builder pre-scoped
    // to a specific table. `providersTable()`, `servicesTable()`, etc. None
    // currently target bookings, so if the nearest context is one of these we
    // can skip the literal entirely.
    const TABLE_HELPER_RE =
      /\b([a-zA-Z]+)Table\s*\(/;
    const FROM_CALL_RE = /\.from\(\s*["']([A-Za-z0-9_]+)["']\s*\)/;

    /**
     * Starting at `endIdx`, walk backwards a bounded window and decide which
     * table the status clause most plausibly binds to. Returns `null` when
     * we can't resolve a context — in which case we *don't* flag anything
     * to avoid false positives.
     */
    function resolveTable(src: string, endIdx: number): string | null {
      const start = Math.max(0, endIdx - 600);
      const window = src.slice(start, endIdx);
      // Find the LAST occurrence of either pattern inside the window.
      let best: { index: number; table: string } | null = null;
      const fromAll = new RegExp(FROM_CALL_RE.source, "g");
      let m: RegExpExecArray | null;
      while ((m = fromAll.exec(window))) {
        best = { index: m.index, table: m[1] };
      }
      const helperAll = new RegExp(TABLE_HELPER_RE.source, "g");
      while ((m = helperAll.exec(window))) {
        if (!best || m.index > best.index) {
          // e.g. `providersTable(` → table name is "providers".
          best = { index: m.index, table: m[1].toLowerCase() + "s" };
        }
      }
      return best?.table ?? null;
    }

    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      let match: RegExpExecArray | null;
      const local = new RegExp(statusCallRe.source, "g");
      while ((match = local.exec(src))) {
        const table = resolveTable(src, match.index);
        if (!table || !BOOKING_TABLES.has(table)) continue;
        const singleLiteral = match[2];
        const arrayBody = match[3];
        if (singleLiteral) {
          if (!allowed.has(singleLiteral)) {
            offenders.push({ file, literal: singleLiteral, context: table });
          }
        } else if (arrayBody) {
          for (const item of arrayBody.split(",")) {
            const lit = item.trim().replace(/^["']|["']$/g, "");
            if (lit && !allowed.has(lit)) {
              offenders.push({ file, literal: lit, context: table });
            }
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
