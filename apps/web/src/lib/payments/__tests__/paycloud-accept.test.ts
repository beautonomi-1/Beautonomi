import { describe, expect, it } from "vitest";
import { resolveAcceptPaycloud } from "../paycloud-accept";

describe("resolveAcceptPaycloud", () => {
  it("prefers provider_paycloud_settings when present", () => {
    expect(
      resolveAcceptPaycloud({ accept_paycloud: false }, { accept_paycloud: true }),
    ).toBe(true);
    expect(
      resolveAcceptPaycloud({ accept_paycloud: true }, { accept_paycloud: false }),
    ).toBe(false);
  });

  it("falls back to providers column when settings row is missing", () => {
    expect(resolveAcceptPaycloud({ accept_paycloud: true }, null)).toBe(true);
    expect(resolveAcceptPaycloud({ accept_paycloud: false }, null)).toBe(false);
  });
});
