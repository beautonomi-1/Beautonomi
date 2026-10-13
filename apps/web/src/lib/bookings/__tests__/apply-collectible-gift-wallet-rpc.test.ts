import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("apply-collectible-gift-wallet rollback RPC", () => {
  it("uses void_gift_card_redemption (not release_gift_card_redemption) after wallet debit failure", () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), "../apply-collectible-gift-wallet.ts");
    const source = readFileSync(path, "utf8");
    expect(source).toContain('"void_gift_card_redemption"');
    expect(source).not.toContain("release_gift_card_redemption");
  });
});
