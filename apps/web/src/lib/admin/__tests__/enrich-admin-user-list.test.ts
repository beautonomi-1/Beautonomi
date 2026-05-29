import { describe, expect, it, vi } from "vitest";
import { enrichAdminUserListRows } from "../enrich-admin-user-list";

describe("enrichAdminUserListRows", () => {
  it("merges auth sign-in, verification summary, and tenant stats", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "bookings") {
          return {
            select: () => ({
              eq: () => ({
                or: async () => ({
                  data: [{ customer_id: "u1", user_id: null }],
                }),
              }),
            }),
          };
        }
        if (table === "providers") {
          return {
            select: () => ({
              eq: () => ({
                in: async () => ({ data: [] }),
              }),
            }),
          };
        }
        return {};
      }),
      rpc: vi.fn(async () => ({
        data: [
          {
            id: "u1",
            last_sign_in_at: "2026-05-28T10:00:00.000Z",
            email_confirmed_at: "2026-05-28T09:00:00.000Z",
            phone_confirmed_at: null,
          },
        ],
      })),
    };

    const rows = await enrichAdminUserListRows(admin as never, "tenant-1", [
      {
        id: "u1",
        email_verified: false,
        phone_verified: false,
        identity_verified: true,
        identity_verification_status: "approved",
        last_login_at: "2026-05-27T08:00:00.000Z",
      },
    ]);

    expect(rows[0]?.stats).toEqual({ booking_count: 1, provider_count: 0 });
    expect(rows[0]?.verification).toEqual({
      email_verified: true,
      phone_verified: false,
      identity_verified: true,
      identity_verification_status: "approved",
    });
    expect(rows[0]?.last_sign_in_at).toBe("2026-05-28T10:00:00.000Z");
    expect(rows[0]?.last_active_at).toBe("2026-05-28T10:00:00.000Z");
  });
});
