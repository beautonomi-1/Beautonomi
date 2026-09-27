import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "../../../../../..");

describe("Paystack currency-aware minimum charge (static)", () => {
  it("resolve-paystack-initialize-amount uses toMinorUnits(1, currency)", () => {
    const src = readFileSync(
      join(repoRoot, "apps/web/src/lib/payments/resolve-paystack-initialize-amount.ts"),
      "utf8",
    );
    expect(src).toContain("toMinorUnits(1, currency)");
    expect(src).not.toMatch(/amountSmallestUnit\s*<\s*100\b/);
  });

  it("verify-paystack-booking-charge passes currency to convertFromSmallestUnit", () => {
    const src = readFileSync(
      join(repoRoot, "apps/web/src/lib/bookings/verify-paystack-booking-charge.ts"),
      "utf8",
    );
    expect(src).toMatch(/convertFromSmallestUnit\([^)]*,\s*currency\)/);
  });

  it("no production call converts Paystack minor units without a currency", () => {
    const srcRoot = join(repoRoot, "apps/web/src");
    const singleArgCall =
      /convert(?:From|To)SmallestUnit\((?:[^(),]|\((?:[^()]|\([^()]*\))*\))*\)/g;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "__tests__" || entry.name === "node_modules") continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const src = readFileSync(full, "utf8");
          for (const m of src.match(singleArgCall) ?? []) {
            offenders.push(`${full.slice(srcRoot.length + 1)}: ${m}`);
          }
        }
      }
    };
    walk(srcRoot);
    expect(offenders).toEqual([]);
  });
});
