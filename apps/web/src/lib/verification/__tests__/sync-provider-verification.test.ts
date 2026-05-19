import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncProviderVerificationState } from "../sync-provider-verification";

type Update = { table: string; payload: Record<string, unknown>; eqArgs?: unknown[] };

function makeAdmin(initial: { is_verified?: boolean | null } = { is_verified: false }) {
  const updates: Update[] = [];
  const upserts: Update[] = [];
  const builder = {
    from(table: string) {
      return {
        upsert: (payload: Record<string, unknown>) => {
          upserts.push({ table, payload });
          return Promise.resolve({ data: null, error: null });
        },
        update: (payload: Record<string, unknown>) => ({
          eq: (..._args: unknown[]) => {
            updates.push({ table, payload, eqArgs: _args });
            return Promise.resolve({ data: null, error: null });
          },
        }),
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: table === "providers" ? { is_verified: initial.is_verified } : null,
                error: null,
              }),
          }),
        }),
      };
    },
  } as any;
  return { admin: builder, updates, upserts };
}

describe("syncProviderVerificationState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks approved across users, KYC, and the public badge", async () => {
    const { admin, updates, upserts } = makeAdmin({ is_verified: false });
    const res = await syncProviderVerificationState(admin, {
      providerId: "provider-1",
      userId: "user-1",
      status: "approved",
      source: "sumsub",
      sumsubApplicantId: "applicant-1",
    });
    expect(res.ok).toBe(true);
    expect(res.badgeChanged).toBe(true);
    expect(res.identityFlagChanged).toBe(true);
    expect(upserts.find((u) => u.table === "provider_verification_status")?.payload.status).toBe(
      "approved",
    );
    expect(updates.find((u) => u.table === "users")?.payload.identity_verified).toBe(true);
    expect(updates.find((u) => u.table === "providers")?.payload.is_verified).toBe(true);
  });

  it("revokes the public badge on rejection", async () => {
    const { admin, updates } = makeAdmin({ is_verified: true });
    const res = await syncProviderVerificationState(admin, {
      providerId: "provider-1",
      userId: "user-1",
      status: "rejected",
      source: "manual_admin",
    });
    expect(res.ok).toBe(true);
    expect(updates.find((u) => u.table === "providers")?.payload.is_verified).toBe(false);
    expect(updates.find((u) => u.table === "users")?.payload.identity_verified).toBe(false);
  });

  it("keeps users + badge unchanged when status is in_progress", async () => {
    const { admin, updates } = makeAdmin({ is_verified: true });
    const res = await syncProviderVerificationState(admin, {
      providerId: "provider-1",
      userId: "user-1",
      status: "in_progress",
      source: "sumsub",
    });
    expect(res.ok).toBe(true);
    expect(res.badgeChanged).toBe(false);
    expect(updates.find((u) => u.table === "users")).toBeUndefined();
    expect(updates.find((u) => u.table === "providers")).toBeUndefined();
  });

  it("resets all surfaces on admin reset", async () => {
    const { admin, updates } = makeAdmin({ is_verified: true });
    const res = await syncProviderVerificationState(admin, {
      providerId: "provider-1",
      userId: "user-1",
      status: "reset",
      source: "admin_reset",
    });
    expect(res.ok).toBe(true);
    expect(updates.find((u) => u.table === "users")?.payload.identity_verified).toBe(false);
    expect(updates.find((u) => u.table === "providers")?.payload.is_verified).toBe(false);
  });

  it("reports badgeChanged=false when the badge already matches the new state", async () => {
    const { admin } = makeAdmin({ is_verified: true });
    const res = await syncProviderVerificationState(admin, {
      providerId: "provider-1",
      userId: "user-1",
      status: "approved",
      source: "sumsub",
    });
    expect(res.ok).toBe(true);
    expect(res.badgeChanged).toBe(false);
  });
});
