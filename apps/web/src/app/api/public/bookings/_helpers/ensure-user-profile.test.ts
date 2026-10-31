import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ensureUserProfileForAuthUser } from "./ensure-user-profile";

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

vi.mock("@/lib/tenant/assign-preferred-home-tenant-from-host", () => ({
  bootstrapPreferredHomeTenantForAuthedUser: vi.fn(async () => undefined),
}));

function authUser(overrides: Partial<User> & { id: string; user_metadata?: Record<string, unknown> }): User {
  return {
    id: overrides.id,
    email: overrides.email ?? "test@example.com",
    app_metadata: {},
    aud: "authenticated",
    created_at: "",
    user_metadata: overrides.user_metadata ?? {},
    ...overrides,
  } as User;
}

function buildAdmin(options: {
  existingUser?: { id: string } | null;
  insertError?: { code: string; message: string } | null;
}) {
  const insert = vi.fn(async () => ({
    error: options.insertError ?? null,
  }));
  const from = vi.fn((table: string) => {
    if (table === "users") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: options.existingUser ?? null,
              error: null,
            })),
          })),
        })),
        insert,
      };
    }
    if (table === "user_wallets") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
        insert: vi.fn(async () => ({ error: null })),
      };
    }
    return {};
  });
  return { client: { from } as unknown as SupabaseClient, insert };
}

describe("ensureUserProfileForAuthUser role mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts customer when metadata role is superadmin", async () => {
    const { client, insert } = buildAdmin({ existingUser: null });
    await ensureUserProfileForAuthUser(
      client,
      authUser({ id: "u1", user_metadata: { role: "superadmin", full_name: "A" } }),
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1", role: "customer" }),
    );
  });

  it("inserts customer when metadata role is provider_owner", async () => {
    const { client, insert } = buildAdmin({ existingUser: null });
    await ensureUserProfileForAuthUser(
      client,
      authUser({ id: "u2", user_metadata: { role: "provider_owner" } }),
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ role: "customer" }),
    );
  });

  it("does not insert when the user row already exists", async () => {
    const { client, insert } = buildAdmin({ existingUser: { id: "u3" } });
    await ensureUserProfileForAuthUser(
      client,
      authUser({ id: "u3", user_metadata: { role: "superadmin" } }),
    );
    expect(insert).not.toHaveBeenCalled();
  });
});
