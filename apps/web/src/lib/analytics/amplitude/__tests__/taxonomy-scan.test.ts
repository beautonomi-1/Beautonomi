/**
 * Analytics taxonomy guard (Part G).
 *
 * 1. Every `EVENT_*` constant referenced anywhere in apps/web, apps/customer and apps/provider
 *    source is declared in the single source of truth `packages/analytics/src/events.ts`.
 * 2. Web `types.ts` mirrors the package: every shared identifier has the identical string value.
 * 3. Mobile helper modules (apps/{app}/src/lib/analytics.ts) use constants, not string literals.
 * 4. Every canonical event value is documented in docs/analytics/EVENT_TAXONOMY.md.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../../../../../..");
const PACKAGE_EVENTS = path.join(REPO_ROOT, "packages/analytics/src/events.ts");
const WEB_TYPES = path.join(REPO_ROOT, "apps/web/src/lib/analytics/amplitude/types.ts");
const TAXONOMY_DOC = path.join(REPO_ROOT, "docs/analytics/EVENT_TAXONOMY.md");

const SCAN_ROOTS = [
  "apps/web/src",
  "apps/customer/app",
  "apps/customer/src",
  "apps/provider/app",
  "apps/provider/src",
].map((p) => path.join(REPO_ROOT, p));

/** Identifiers that intentionally live outside the package (documented exceptions). */
const IDENTIFIER_ALLOWLIST = new Set<string>([
  // Operational / infra events tracked outside the product taxonomy.
  "EVENT_KEYS",
  // Doc filename / comment token (`EVENT_TAXONOMY.md`), not an event constant.
  "EVENT_TAXONOMY",
  // Staff-notification type map in notify-staff-event.ts, not an Amplitude event.
  "EVENT_TO_TYPE",
]);

/** Regex-ish identifiers that are not analytics event constants (Slack/ops event keys etc.). */
const IDENTIFIER_PREFIX_IGNORE = ["EVENT_KEY_", "EVENT_TYPE_", "EVENT_HANDLERS"];

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", "coverage", ".expo", "__tests__", "test-results"]);
const SOURCE_EXT = new Set([".ts", ".tsx"]);

function parseConstants(file: string): Map<string, string> {
  const src = fs.readFileSync(file, "utf8");
  const out = new Map<string, string>();
  const literal = /export const (EVENT_[A-Z0-9_]+)\s*=\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = literal.exec(src))) out.set(m[1], m[2]);
  // Aliases: export const EVENT_A = EVENT_B;
  const alias = /export const (EVENT_[A-Z0-9_]+)\s*=\s*(EVENT_[A-Z0-9_]+);/g;
  while ((m = alias.exec(src))) {
    const target = out.get(m[2]);
    if (target) out.set(m[1], target);
  }
  return out;
}

function walk(dir: string, acc: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), acc);
      continue;
    }
    const ext = path.extname(entry.name);
    if (!SOURCE_EXT.has(ext)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    acc.push(path.join(dir, entry.name));
  }
}

function collectUsedIdentifiers(): Map<string, string[]> {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(root, files);
  const used = new Map<string, string[]>();
  const re = /\bEVENT_[A-Z0-9_]+\b/g;
  for (const file of files) {
    if (file === PACKAGE_EVENTS || file === WEB_TYPES) continue;
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes("EVENT_")) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const id = m[0];
      if (IDENTIFIER_PREFIX_IGNORE.some((p) => id.startsWith(p))) continue;
      const list = used.get(id) ?? [];
      if (list.length < 3) list.push(path.relative(REPO_ROOT, file));
      used.set(id, list);
    }
  }
  return used;
}

describe("analytics taxonomy — single source of truth", () => {
  const packageEvents = parseConstants(PACKAGE_EVENTS);
  const webEvents = parseConstants(WEB_TYPES);

  it("package declares a non-trivial taxonomy", () => {
    expect(packageEvents.size).toBeGreaterThan(60);
    expect(packageEvents.get("EVENT_ADDITIONAL_CHARGE_PAID")).toBe("additional_charge_paid");
    expect(packageEvents.get("EVENT_PROVIDER_ETA_UPDATED")).toBe("provider_eta_updated");
  });

  it("Part G server money events are all declared in package + web mirror", () => {
    const required = [
      "payment_success",
      "payment_failed",
      "additional_charge_paid",
      "wallet_topup",
      "gift_card_purchased",
      "gift_card_redeemed",
      "membership_purchased",
      "membership_renewed",
      "product_order_paid",
      "provider_subscription_paid",
      "ads_budget_paid",
      "apple_iap_verified",
      "app_open",
      "signup_start",
    ];
    const pkgValues = new Set(packageEvents.values());
    const webValues = new Set(webEvents.values());
    for (const name of required) {
      expect(pkgValues.has(name), "pkg events missing " + name).toBe(true);
      expect(webValues.has(name), "web types.ts missing " + name).toBe(true);
    }
  });

  it("web types.ts values match the package for every shared identifier", () => {
    const mismatches: string[] = [];
    for (const [id, value] of webEvents) {
      const pkg = packageEvents.get(id);
      if (pkg === undefined) {
        mismatches.push(`${id} is declared in web types.ts but not in packages/analytics`);
      } else if (pkg !== value) {
        mismatches.push(`${id}: web="${value}" package="${pkg}"`);
      }
    }
    expect(mismatches, mismatches.join("\n")).toEqual([]);
  });

  it("every EVENT_* identifier used in apps source is declared in the package", () => {
    const used = collectUsedIdentifiers();
    const missing: string[] = [];
    for (const [id, files] of used) {
      if (IDENTIFIER_ALLOWLIST.has(id)) continue;
      if (!packageEvents.has(id)) missing.push(`${id} (${files.join(", ")})`);
    }
    expect(missing, `Undeclared analytics constants:\n${missing.join("\n")}`).toEqual([]);
  });

  it("mobile analytics helper modules use constants instead of string literals", () => {
    const helperFiles = [
      "apps/customer/src/lib/analytics.ts",
      "apps/provider/src/lib/analytics.ts",
    ].map((p) => path.join(REPO_ROOT, p));
    const literalCalls: string[] = [];
    for (const file of helperFiles) {
      const src = fs.readFileSync(file, "utf8");
      const re = /\btrack\(\s*["'`]([^"'`]+)["'`]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) literalCalls.push(`${path.relative(REPO_ROOT, file)} → "${m[1]}"`);
    }
    expect(literalCalls, literalCalls.join("\n")).toEqual([]);
  });

  it("every canonical event value is documented in EVENT_TAXONOMY.md", () => {
    const doc = fs.readFileSync(TAXONOMY_DOC, "utf8");
    const undocumented: string[] = [];
    for (const [id, value] of packageEvents) {
      if (!doc.includes(`\`${value}\``)) undocumented.push(`${id} (${value})`);
    }
    expect(undocumented, `Undocumented events:\n${undocumented.join("\n")}`).toEqual([]);
  });
});
