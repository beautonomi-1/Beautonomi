/**
 * Native browser dialogs (window.confirm / prompt / alert / bare confirm) block
 * accessibility, theming, and async flows. Migrate offenders to AdminConfirmDialog.
 *
 * Policy:
 *  - New files with native dialogs fail CI (must not exceed allowlist).
 *  - Allowlist should shrink as pages migrate; remove stale entries when fixed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import allowlist from "./nativeDialogAllowlist.json";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "..");

/** Matches window.confirm(, window.prompt(, window.alert(, or bare confirm( — not AdminConfirmDialog. */
const NATIVE_DIALOG_RE = /(?:window\.(?:confirm|prompt|alert)\s*\(|(?<![.\w])confirm\s*\()/;

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(abs, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

function scanNativeDialogOffenders(): string[] {
  const scanDirs = ["routes", "components"].map((d) => join(srcRoot, d));
  const offenders: string[] = [];

  for (const dir of scanDirs) {
    for (const abs of walkTsFiles(dir)) {
      const src = readFileSync(abs, "utf8");
      if (NATIVE_DIALOG_RE.test(src)) {
        offenders.push(relative(srcRoot, abs).replace(/\\/g, "/"));
      }
    }
  }

  return offenders.sort();
}

function normalizeRelPath(p: string): string {
  return p.replace(/\\/g, "/");
}

describe("native dialog regression (routes + components)", () => {
  const offenders = scanNativeDialogOffenders();
  const allowed = new Set(allowlist.allowedFiles.map(normalizeRelPath));

  it("does not introduce new native-dialog files beyond the allowlist", () => {
    const unexpected = offenders.filter((f) => !allowed.has(f));
    expect(
      unexpected,
      `New native dialog usage — migrate to AdminConfirmDialog and do not expand allowlist:\n${unexpected.join("\n")}`,
    ).toHaveLength(0);
  });

  it("does not increase native-dialog offender count", () => {
    expect(
      offenders.length,
      `Offender count grew (${offenders.length} > ${allowlist.allowedFiles.length}). Fix new usage instead of expanding allowlist.`,
    ).toBeLessThanOrEqual(allowlist.allowedFiles.length);
  });

  it("allowlist has no stale entries (shrinks as pages migrate)", () => {
    const offenderSet = new Set(offenders);
    const stale = allowlist.allowedFiles.filter((f) => !offenderSet.has(f));
    expect(
      stale,
      `Remove migrated files from nativeDialogAllowlist.json:\n${stale.join("\n")}`,
    ).toHaveLength(0);
  });
});
