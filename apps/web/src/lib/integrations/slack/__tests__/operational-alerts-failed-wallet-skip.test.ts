import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "../operational-alerts.ts"), "utf8");

describe("operational alerts failed wallet credit backup", () => {
  it("skips hourly failed-wallet Slack when auto wallet credit retry is enabled", () => {
    expect(source).toMatch(/getEffectiveAutoWalletCreditSettings/);
    expect(source).toMatch(/autoWalletCreditSettings\.enabled\) continue/);
  });
});
