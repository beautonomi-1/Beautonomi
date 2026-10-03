/**
 * Phase 1a — bookings writes must not use the user-JWT Supabase client.
 *
 * After route-level auth, `bookings` UPDATE chains must go through
 * `getBookingsAdminClient()` or an explicit service-role client (`getSupabaseAdmin`, etc.).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = join(__dirname, "../../../../..");
const webSrc = join(repoRoot, "apps/web/src");

/** Known remaining USER-JWT booking updates (Phase 1b+). Remove paths as they migrate. */
const BOOKINGS_UPDATE_ALLOWLIST = new Set<string>([
  "app/api/admin/bookings/[id]/cancel/route.ts",
  "app/api/admin/bookings/[id]/dispute/resolve/route.ts",
  "app/api/admin/bookings/[id]/refund/route.ts",
  "app/api/me/bookings/[id]/cancel/route.ts",
  "app/api/me/bookings/[id]/reschedule/route.ts",
  "app/api/me/bookings/[id]/route.ts",
  "app/api/portal/booking/cancel/route.ts",
  "app/api/provider/bookings/[id]/eta/route.ts",
  "app/api/provider/bookings/[id]/location/route.ts",
  "app/api/provider/bookings/[id]/mark-paid/route.ts",
  "app/api/provider/bookings/[id]/refund/route.ts",
  "app/api/provider/bookings/[id]/request-payment/route.ts",
  "app/api/provider/bookings/[id]/route.ts",
  "app/api/provider/bookings/bulk/route.ts",
  "app/api/provider/bookings/close-out/bulk-complete/route.ts",
  "app/api/provider/bookings/route.ts",
  "app/api/provider/waiting-room/route.ts",
  "lib/bookings/paystack-dispute-lifecycle.ts",
  "lib/payments/settle-card-machine-payment.ts",
  "lib/whatsapp/inbound-handler.ts",
]);

const IMPORTS_USER_JWT = /import[\s\S]*?\bgetSupabaseServer\b[\s\S]*?from\s*["']@\/lib\/supabase\/server["']/;

const INLINE_USER_UPDATE =
  /(?:await\s+)?supabase\s*\.\s*from\s*\(\s*["']bookings["']\s*\)\s*\.\s*update\s*\(/;

/** Multiline: `await supabase` → `.from("bookings")` → `.update(` within a short window. */
const MULTILINE_USER_UPDATE =
  /(?:await\s+)?supabase[\s\n]+(?:\.[\s\n]*[\w[\].]+[\s\n]*)*?\.from\s*\(\s*["']bookings["']\s*\)[\s\n]+\.update\s*\(/;

const ALLOWED_CLIENT_PREFIX =
  /(?:getBookingsAdminClient\s*\(\s*\)|getSupabaseAdmin\s*\(\s*\)|bookingsAdmin|adminSupabase|supabaseAdmin|\badmin\b)\s*[\s\n]*(?:\.[\s\n]*[\w[\].]+[\s\n]*)*?\.from\s*\(\s*["']bookings["']\s*\)[\s\n]+\.update\s*\(/;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "__tests__" ||
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === ".turbo"
      ) {
        continue;
      }
      walk(p, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")) {
      acc.push(p);
    }
  }
  return acc;
}

function stripAllowedAdminUpdates(src: string): string {
  return src.replace(ALLOWED_CLIENT_PREFIX, "/* allowed-admin-bookings-update */");
}

function hasForbiddenUserJwtBookingUpdate(src: string): boolean {
  const stripped = stripAllowedAdminUpdates(src);
  return INLINE_USER_UPDATE.test(stripped) || MULTILINE_USER_UPDATE.test(stripped);
}

/** One scan per worker — full-suite runs were timing out on repeated walks. */
const WEB_SRC_FILES = walk(webSrc);

describe(
  "bookings write client (Phase 1a static guard)",
  { timeout: 120_000 },
  () => {
  const files = WEB_SRC_FILES;

  it("Phase 1a routes do not UPDATE bookings via user-JWT supabase", () => {
    const phase1aPaths = [
      "app/api/provider/bookings/[id]/arrive/route.ts",
      "app/api/provider/bookings/[id]/verify-arrival/route.ts",
      "app/api/provider/bookings/[id]/verify-qr/route.ts",
      "app/api/provider/bookings/[id]/override-arrival-verification/route.ts",
      "app/api/provider/bookings/[id]/consent-document/route.ts",
      "app/api/provider/bookings/[id]/resend-arrival-otp/route.ts",
      "app/api/provider/reschedule-requests/[id]/route.ts",
      "app/api/provider/routes/optimize/route.ts",
      "lib/provider/find-future-bookings-for-staff.ts",
    ];

    for (const rel of phase1aPaths) {
      const abs = join(webSrc, rel);
      const src = readFileSync(abs, "utf8");
      expect(
        hasForbiddenUserJwtBookingUpdate(src),
        `${rel} must use getBookingsAdminClient() for bookings UPDATE`,
      ).toBe(false);
    }
  });

  it("no file imports getSupabaseServer and UPDATEs bookings via user-JWT supabase (except allowlist)", () => {
    const offenders: string[] = [];

    for (const abs of files) {
      const rel = relative(webSrc, abs).replace(/\\/g, "/");
      if (BOOKINGS_UPDATE_ALLOWLIST.has(rel)) continue;

      const src = readFileSync(abs, "utf8");
      if (!IMPORTS_USER_JWT.test(src)) continue;
      if (hasForbiddenUserJwtBookingUpdate(src)) {
        offenders.push(rel);
      }
    }

    expect(
      offenders,
      `USER-JWT bookings UPDATE (use getBookingsAdminClient after auth):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
  },
);
