import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { syncGroupBookingStatusFromChildren } from "@/lib/bookings/group-booking";

function makeAdmin(children: Array<{ status: string }>) {
  const updates: Array<Record<string, unknown>> = [];
  return {
    updates,
    client: {
      from(table: string) {
        if (table !== "bookings" && table !== "group_bookings") {
          throw new Error(`unexpected table ${table}`);
        }
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          then: (resolve: (v: unknown) => void) => {
            if (table === "bookings") {
              resolve({ data: children, error: null });
              return;
            }
            resolve({ error: null });
          },
          update: (payload: Record<string, unknown>) => {
            updates.push(payload);
            const updateChain: any = {
              eq: () => updateChain,
              then: (resolve: (v: unknown) => void) => resolve({ error: null }),
            };
            return updateChain;
          },
        };
        return chain;
      },
    } as unknown as SupabaseClient,
  };
}

describe("syncGroupBookingStatusFromChildren", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets group status to pending when any child is pending", async () => {
    const admin = makeAdmin([{ status: "pending" }, { status: "confirmed" }]);
    const next = await syncGroupBookingStatusFromChildren(admin.client, "group-1");
    expect(next).toBe("pending");
    expect(admin.updates[0]?.status).toBe("pending");
  });

  it("sets group status to completed when every child is completed", async () => {
    const admin = makeAdmin([{ status: "completed" }, { status: "completed" }]);
    const next = await syncGroupBookingStatusFromChildren(admin.client, "group-1");
    expect(next).toBe("completed");
    expect(admin.updates[0]?.status).toBe("completed");
  });

  it("sets group status to cancelled when every child is cancelled", async () => {
    const admin = makeAdmin([{ status: "cancelled" }, { status: "cancelled" }]);
    const next = await syncGroupBookingStatusFromChildren(admin.client, "group-1");
    expect(next).toBe("cancelled");
    expect(admin.updates[0]?.status).toBe("cancelled");
  });
});
