/**
 * Contract: mobile + web must send bodies that match `updateSchema` in
 * `returns/[id]/route.ts` (e.g. courier for ship-back, `provider_notes` not `note`).
 */
import { describe, it, expect } from "vitest";
import { updateSchema } from "@/app/api/provider/returns/[id]/route";

describe("provider return PATCH body contract (updateSchema)", () => {
  it("accepts approve with courier (mobile 'Ship back' maps to this)", () => {
    const r = updateSchema.safeParse({
      action: "approve",
      return_method: "courier",
      resolution: "full_refund",
    });
    expect(r.success).toBe(true);
  });

  it("accepts drop_off and not_required", () => {
    expect(
      updateSchema.safeParse({ action: "approve", return_method: "drop_off" }).success,
    ).toBe(true);
    expect(
      updateSchema.safeParse({ action: "approve", return_method: "not_required" }).success,
    ).toBe(true);
  });

  it("rejects legacy ship_back (invalid enum) — use courier", () => {
    const r = updateSchema.safeParse({
      action: "approve",
      return_method: "ship_back",
    });
    expect(r.success).toBe(false);
  });

  it("accepts reject with provider_notes", () => {
    const r = updateSchema.safeParse({
      action: "reject",
      provider_notes: "Outside return window",
    });
    expect(r.success).toBe(true);
  });

  it("strips unknown keys; `note` does not populate provider_notes", () => {
    const r = updateSchema.safeParse({
      action: "reject",
      note: "This should be stripped, not mapped",
    } as Record<string, unknown>);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.provider_notes).toBeUndefined();
    }
  });
});
