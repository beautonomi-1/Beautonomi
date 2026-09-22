import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("mobile app locale completion gate", () => {
  it(
    "reports zero leftover English for all 11 mobile UI locales",
    () => {
    const r = spawnSync(process.execPath, ["scripts/leftover-tr-mobile-apps.mjs", "--report"], {
      cwd: pkgRoot,
      encoding: "utf8",
    });
    expect(r.status).toBe(0);

    const targets = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss", "fr", "ar"] as const;
    for (const locale of targets) {
      const m = (r.stdout || "").match(new RegExp(`${locale}: leftover=(\\d+)`));
      expect(m, r.stdout).toBeTruthy();
      expect(Number(m![1]), `${locale} leftover-English`).toBe(0);
    }

    const total = (r.stdout || "").match(/Total leftover-English \(in-scope\): (\d+)/);
    expect(Number(total![1])).toBe(0);
    },
    120_000,
  );
});
