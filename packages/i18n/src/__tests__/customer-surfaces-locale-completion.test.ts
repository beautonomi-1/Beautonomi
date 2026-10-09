import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("customer app + customer web locale completion gate", () => {
  it("reports zero leftover English for all 22 picker locales", () => {
    const r = spawnSync(process.execPath, ["scripts/audit-customer-surfaces.mjs"], {
      cwd: pkgRoot,
      encoding: "utf8",
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);

    const total = (r.stdout || "").match(/Total leftover keys \(all locales\): (\d+)/);
    expect(Number(total![1])).toBe(0);
  }, 180_000);
});
