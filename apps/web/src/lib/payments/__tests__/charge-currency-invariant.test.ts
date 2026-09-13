import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const FORBIDDEN_IMPORTS = ["useDisplayMoney", "ApproxMoneyLabel"];
const ROOT = path.resolve(__dirname, "../../..");

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      walk(full, acc);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function filesUnder(rel: string): string[] {
  return walk(path.join(ROOT, rel));
}

describe("charge currency invariant", () => {
  it("booking/checkout/cart/payments modules do not import display-money helpers", () => {
    const targets = [
      ...filesUnder("src/app/book"),
      ...filesUnder("src/app/cart"),
      ...filesUnder("src/lib/payments"),
    ].filter((f) => !f.includes("__tests__"));

    const violations: string[] = [];
    for (const file of targets) {
      const src = fs.readFileSync(file, "utf8");
      for (const token of FORBIDDEN_IMPORTS) {
        if (src.includes(token)) {
          violations.push(`${path.relative(ROOT, file)}: ${token}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
