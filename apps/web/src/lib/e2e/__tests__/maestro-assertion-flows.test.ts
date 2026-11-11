import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Maestro assertion flows (F-09)", () => {
  const dir = path.resolve(process.cwd(), "../../tooling/e2e/maestro");

  it("ships login smokes with assertVisible (not screenshot-only)", () => {
    const yamls = readdirSync(dir).filter((f) => f.endsWith(".yaml"));
    expect(yamls).toEqual(
      expect.arrayContaining(["provider.login-assert.yaml", "customer.login-assert.yaml"]),
    );
    for (const file of yamls) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).toContain("assertVisible:");
      expect(src).not.toContain("takeScreenshot:");
    }
  });
});
