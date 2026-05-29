import { describe, expect, it, vi } from "vitest";
import { syncUserAuthMetadataToPublicProfile } from "../sync-user-auth-metadata";

describe("syncUserAuthMetadataToPublicProfile", () => {
  it("updates last_login_at and email_verified when auth is ahead of public.users", async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) });
    const admin = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                last_login_at: null,
                email_verified: false,
                phone_verified: false,
              },
            }),
          }),
        }),
        update,
      })),
    };

    await syncUserAuthMetadataToPublicProfile(admin as never, "user-1", {
      last_sign_in_at: "2026-05-28T12:00:00.000Z",
      email_confirmed_at: "2026-05-28T11:00:00.000Z",
      phone_confirmed_at: null,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_login_at: "2026-05-28T12:00:00.000Z",
        email_verified: true,
      }),
    );
  });

  it("skips write when public.users already matches auth", async () => {
    const update = vi.fn();
    const admin = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                last_login_at: "2026-05-28T12:00:00.000Z",
                email_verified: true,
                phone_verified: true,
              },
            }),
          }),
        }),
        update,
      })),
    };

    await syncUserAuthMetadataToPublicProfile(admin as never, "user-1", {
      last_sign_in_at: "2026-05-28T12:00:00.000Z",
      email_confirmed_at: "2026-05-28T11:00:00.000Z",
      phone_confirmed_at: "2026-05-28T10:00:00.000Z",
    });

    expect(update).not.toHaveBeenCalled();
  });
});
