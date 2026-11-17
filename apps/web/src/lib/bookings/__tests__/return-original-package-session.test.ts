import { describe, expect, it, vi } from "vitest";
import { returnOriginalPackageSession } from "../reschedule-carry-over";

function adminFor(
  entitlementId: string | null,
  rpcResult: { data?: boolean | null; error: { message: string } | null } = { data: true, error: null },
) {
  const rpc = vi.fn(async () => rpcResult);
  const updates: Record<string, unknown>[] = [];
  const admin = {
    rpc,
    updates,
    from() {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      let payload: Record<string, unknown> = {};
      chain.select = self;
      chain.eq = self;
      chain.is = self;
      chain.update = (next: Record<string, unknown>) => {
        payload = next;
        updates.push(next);
        return chain;
      };
      chain.maybeSingle = async () => ({
        data: { customer_package_entitlement_id: entitlementId },
        error: null,
      });
      chain.then = (resolve: (value: unknown) => unknown) =>
        resolve({
          data: payload.customer_package_entitlement_id === null ? [{ id: "booking-old" }] : [],
          error: null,
        });
      return chain;
    },
  };
  return admin;
}

describe("returnOriginalPackageSession", () => {
  it("returns the original session when the replacement used a different one", async () => {
    const admin = adminFor("ent-old");

    await returnOriginalPackageSession(admin as never, "booking-old", "cust-1", "ent-new");

    expect(admin.rpc).toHaveBeenCalledWith("restore_customer_package_entitlement", {
      p_entitlement_id: "ent-old",
      p_customer_id: "cust-1",
    });
    expect(admin.updates).toEqual([{ customer_package_entitlement_id: null }]);
  });

  it("clears the original pointer when the replacement already holds that session", async () => {
    const admin = adminFor("ent-1");

    await returnOriginalPackageSession(admin as never, "booking-old", "cust-1", "ent-1");

    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.updates).toEqual([{ customer_package_entitlement_id: null }]);
  });

  it("leaves the session on the original visit when the return fails", async () => {
    const admin = adminFor("ent-old", { error: { message: "down" } });

    await returnOriginalPackageSession(admin as never, "booking-old", "cust-1", null);

    expect(admin.rpc).toHaveBeenCalledOnce();
    expect(admin.updates).toEqual([
      { customer_package_entitlement_id: null },
      { customer_package_entitlement_id: "ent-old" },
    ]);
  });

  it("leaves the session on the original visit when the return reports that nothing was given back", async () => {
    const admin = adminFor("ent-old", { data: false, error: null });

    await returnOriginalPackageSession(admin as never, "booking-old", "cust-1", null);

    expect(admin.updates).toEqual([
      { customer_package_entitlement_id: null },
      { customer_package_entitlement_id: "ent-old" },
    ]);
  });
});
