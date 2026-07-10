import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearIdentityVerificationForReverify } from "../clear-identity-verification-for-reverify";

function makeAdmin() {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const upserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const selects: string[] = [];

  const admin = {
    from(table: string) {
      return {
        select: (cols?: string) => {
          selects.push(`${table}:${cols ?? "*"}`);
          return {
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data:
                    table === "providers"
                      ? { user_id: "user-1" }
                      : table === "identity_verification_sessions"
                        ? [{ id: "session-1" }]
                        : null,
                  error: null,
                }),
              single: () =>
                Promise.resolve({
                  data: { id: "user-1", identity_verified: false, identity_verification_status: "none" },
                  error: null,
                }),
            }),
            not: () => ({
              eq: () => ({
                eq: () => ({
                  select: () =>
                    Promise.resolve({
                      data: [{ id: "session-1" }],
                      error: null,
                    }),
                }),
              }),
            }),
          };
        },
        update: (payload: Record<string, unknown>) => ({
          eq: () => ({
            in: () => Promise.resolve({ data: null, error: null }),
            select: () =>
              Promise.resolve({
                data: [{ id: "session-1" }],
                error: null,
              }),
          }),
          not: () => ({
            eq: () => ({
              eq: () => ({
                select: () =>
                  Promise.resolve({
                    data: [{ id: "session-1" }],
                    error: null,
                  }),
              }),
            }),
          }),
        }),
        upsert: (payload: Record<string, unknown>) => {
          upserts.push({ table, payload });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  } as any;

  return { admin, updates, upserts };
}

describe("clearIdentityVerificationForReverify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("abandons sessions and syncs provider reset state", async () => {
    const { admin, upserts } = makeAdmin();
    const res = await clearIdentityVerificationForReverify(admin, {
      userId: "user-1",
      providerId: "provider-1",
      adminUserId: "admin-1",
    });

    expect(res.ok).toBe(true);
    expect(res.sessionsAbandoned).toBe(1);
    expect(upserts.find((u) => u.table === "provider_verification_status")?.payload.status).toBe(
      "not_started",
    );
  });
});
