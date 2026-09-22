import { describe, expect, it } from "vitest";
import { assertOpsDeskAccess } from "@/lib/provider-ops/ops-desk-auth";

describe("assertOpsDeskAccess", () => {
  it("allows managers for any desk", () => {
    expect(() => assertOpsDeskAccess("superadmin", ["sales"])).not.toThrow();
    expect(() => assertOpsDeskAccess("admin_operations", ["retention"])).not.toThrow();
  });

  it("allows specialists only for their desk", () => {
    expect(() => assertOpsDeskAccess("admin_sales", ["sales"])).not.toThrow();
    expect(() => assertOpsDeskAccess("admin_onboarding", ["onboarding"])).not.toThrow();
  });

  it("blocks specialists from other desks", () => {
    expect(() => assertOpsDeskAccess("admin_sales", ["onboarding"])).toThrow(
      /Insufficient permissions/,
    );
  });
});
