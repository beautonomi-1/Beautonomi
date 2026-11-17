import { describe, expect, it, vi } from "vitest";
import {
  borrowPackageSessionForReschedule,
  returnBorrowedSessionIfReleased,
} from "../reschedule-carry-over";

function adminWith(entitlementAfter: string | null) {
  const rpc = vi.fn(async () => ({ data: true, error: null }));
  return {
    rpc,
    admin: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { customer_package_entitlement_id: entitlementAfter },
              error: null,
            }),
          }),
        }),
      }),
      rpc,
    },
  };
}

describe("returnBorrowedSessionIfReleased", () => {
  it("puts the session back when a reschedule replacement was released", async () => {
    const { admin, rpc } = adminWith(null);

    await returnBorrowedSessionIfReleased(admin as never, {
      id: "booking-new",
      customer_id: "cust-1",
      customer_package_entitlement_id: "ent-1",
      rescheduled_from_booking_id: "booking-old",
    });

    expect(rpc).toHaveBeenCalledWith("redeem_customer_package_entitlement", {
      p_entitlement_id: "ent-1",
      p_customer_id: "cust-1",
    });
  });

  it("puts the session back when the released visit is the one this checkout borrowed", async () => {
    const { admin, rpc } = adminWith(null);

    await returnBorrowedSessionIfReleased(
      admin as never,
      {
        id: "booking-old",
        customer_id: "cust-1",
        customer_package_entitlement_id: "ent-1",
        rescheduled_from_booking_id: null,
      },
      "ent-1",
    );

    expect(rpc).toHaveBeenCalledOnce();
  });

  it("leaves the session returned when the released visit is not a reschedule", async () => {
    const { admin, rpc } = adminWith(null);

    await returnBorrowedSessionIfReleased(admin as never, {
      id: "booking-1",
      customer_id: "cust-1",
      customer_package_entitlement_id: "ent-1",
      rescheduled_from_booking_id: null,
    });

    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not take the session when the release did not clear it", async () => {
    const { admin, rpc } = adminWith("ent-1");

    await returnBorrowedSessionIfReleased(admin as never, {
      id: "booking-new",
      customer_id: "cust-1",
      customer_package_entitlement_id: "ent-1",
      rescheduled_from_booking_id: "booking-old",
    });

    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports that the session was not held when the hold reports that nothing was taken", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { customer_package_entitlement_id: null },
              error: null,
            }),
          }),
        }),
      }),
      rpc,
    };

    const held = await returnBorrowedSessionIfReleased(admin as never, {
      id: "booking-new",
      customer_id: "cust-1",
      customer_package_entitlement_id: "ent-1",
      rescheduled_from_booking_id: "booking-old",
    });

    expect(held).toBe(false);
  });
});

describe("borrowPackageSessionForReschedule", () => {
  it("borrows the session only when one was given back", async () => {
    const admin = { rpc: vi.fn(async () => ({ data: true, error: null })) };

    await expect(
      borrowPackageSessionForReschedule(admin as never, "ent-1", "cust-1"),
    ).resolves.toBe(true);
  });

  it("does not borrow the session when the return reports that nothing was given back", async () => {
    const admin = { rpc: vi.fn(async () => ({ data: null, error: null })) };

    await expect(
      borrowPackageSessionForReschedule(admin as never, "ent-1", "cust-1"),
    ).resolves.toBe(false);
  });
});
