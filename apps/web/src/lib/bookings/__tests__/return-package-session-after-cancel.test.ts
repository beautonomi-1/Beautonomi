import { beforeEach, describe, expect, it, vi } from "vitest";

const pendingReplacement = vi.fn(async () => false);

vi.mock("@/lib/bookings/reschedule-carry-over", () => ({
  hasPendingRescheduleReplacement: (...args: unknown[]) => pendingReplacement(...args),
}));

import { returnPackageSessionAfterCancel } from "../return-package-session-after-cancel";

function adminFor(
  row: {
    customer_id: string | null;
    customer_package_entitlement_id: string | null;
    rescheduled_from_booking_id?: string | null;
  } | null,
  original?: { customer_package_entitlement_id: string | null } | null,
  restored: boolean | null = true,
) {
  const rpc = vi.fn(async () => ({ data: restored, error: null }));
  const updates: Record<string, unknown>[] = [];
  let reads = 0;
  const admin = {
    rpc,
    updates,
    from() {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.is = self;
      chain.update = (payload: Record<string, unknown>) => {
        updates.push(payload);
        return chain;
      };
      chain.maybeSingle = async () => {
        reads += 1;
        const data = reads === 1 ? row : original === undefined ? row : original;
        return { data, error: null };
      };
      chain.then = (resolve: (value: unknown) => unknown) =>
        resolve({
          data: payloadCleared(updates) ? [{ id: "booking-1" }] : [],
          error: null,
        });
      return chain;
    },
  };
  return admin;
}

function payloadCleared(updates: Record<string, unknown>[]) {
  return updates.some((row) => row.customer_package_entitlement_id === null);
}

describe("returnPackageSessionAfterCancel", () => {
  beforeEach(() => {
    pendingReplacement.mockReset();
    pendingReplacement.mockResolvedValue(false);
  });

  it("returns the prepaid session once after the visit is cancelled", async () => {
    const admin = adminFor({ customer_id: "cust-1", customer_package_entitlement_id: "ent-1" });

    await returnPackageSessionAfterCancel(admin as never, "booking-1");

    expect(admin.rpc).toHaveBeenCalledWith("restore_customer_package_entitlement", {
      p_entitlement_id: "ent-1",
      p_customer_id: "cust-1",
    });
  });

  it("leaves the session when the visit is being rescheduled", async () => {
    pendingReplacement.mockResolvedValue(true);
    const admin = adminFor({ customer_id: "cust-1", customer_package_entitlement_id: "ent-1" });

    await returnPackageSessionAfterCancel(admin as never, "booking-1");

    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("does not return a session the visit never used", async () => {
    const admin = adminFor({ customer_id: "cust-1", customer_package_entitlement_id: null });

    await returnPackageSessionAfterCancel(admin as never, "booking-1");

    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("keeps the session on the original visit when a replacement is cancelled", async () => {
    const admin = adminFor({
      customer_id: "cust-1",
      customer_package_entitlement_id: "ent-1",
      rescheduled_from_booking_id: "booking-old",
    });

    await returnPackageSessionAfterCancel(admin as never, "booking-new");

    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.updates).toEqual([
      expect.objectContaining({ customer_package_entitlement_id: null }),
    ]);
  });

  it("returns the replacement's own session when the original visit holds a different one", async () => {
    const admin = adminFor(
      {
        customer_id: "cust-1",
        customer_package_entitlement_id: "ent-new",
        rescheduled_from_booking_id: "booking-old",
      },
      { customer_package_entitlement_id: "ent-old" },
    );

    await returnPackageSessionAfterCancel(admin as never, "booking-new");

    expect(admin.rpc).toHaveBeenCalledWith("restore_customer_package_entitlement", {
      p_entitlement_id: "ent-new",
      p_customer_id: "cust-1",
    });
  });

  it("puts the session back on the visit when the return reports that nothing was given back", async () => {
    const admin = adminFor(
      { customer_id: "cust-1", customer_package_entitlement_id: "ent-1" },
      undefined,
      false,
    );

    await returnPackageSessionAfterCancel(admin as never, "booking-1");

    expect(admin.updates).toEqual([
      { customer_package_entitlement_id: null },
      { customer_package_entitlement_id: "ent-1" },
    ]);
  });
});
