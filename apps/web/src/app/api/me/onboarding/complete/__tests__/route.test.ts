import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockSendTemplateNotification = vi.fn();
const afterCallbacks: Array<() => Promise<void> | void> = [];

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => Promise<void> | void) => {
      afterCallbacks.push(fn);
    },
  };
});

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/tenant/assign-preferred-home-tenant-from-host", () => ({
  bootstrapPreferredHomeTenantForAuthedUser: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendTemplateNotification: (...args: unknown[]) => mockSendTemplateNotification(...args),
}));

function makeUsersClient(opts: {
  existingCompletedAt: string | null;
  updatedRows: Array<{ id: string }>;
}) {
  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      is: vi.fn(() => ({
        select: vi.fn(async () => ({ data: opts.updatedRows, error: null })),
      })),
    })),
  }));
  return {
    update,
    client: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { customer_onboarding_completed_at: opts.existingCompletedAt },
              error: null,
            })),
          })),
        })),
        update,
      })),
    },
  };
}

async function runAfterCallbacks() {
  while (afterCallbacks.length) await afterCallbacks.shift()!();
}

describe("POST /api/me/onboarding/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "cust-1", role: "customer" } });
  });

  it("marks completion and sends the welcome message the first time", async () => {
    const { client, update } = makeUsersClient({ existingCompletedAt: null, updatedRows: [{ id: "cust-1" }] });
    mockGetSupabaseServer.mockResolvedValue(client);

    const { POST } = await import("../route");
    const res = await POST(new NextRequest("http://localhost/api/me/onboarding/complete", { method: "POST" }));
    await runAfterCallbacks();

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
    expect(mockSendTemplateNotification).toHaveBeenCalledWith(
      "welcome_message",
      ["cust-1"],
      {},
      ["push", "email"],
      { appType: "customer" },
    );
  });

  it("does not resend the welcome when a concurrent request already completed", async () => {
    const { client } = makeUsersClient({ existingCompletedAt: null, updatedRows: [] });
    mockGetSupabaseServer.mockResolvedValue(client);

    const { POST } = await import("../route");
    const res = await POST(new NextRequest("http://localhost/api/me/onboarding/complete", { method: "POST" }));
    await runAfterCallbacks();

    expect(res.status).toBe(200);
    expect(mockSendTemplateNotification).not.toHaveBeenCalled();
  });

  it("is idempotent once completed", async () => {
    const { client, update } = makeUsersClient({
      existingCompletedAt: "2026-01-01T00:00:00.000Z",
      updatedRows: [],
    });
    mockGetSupabaseServer.mockResolvedValue(client);

    const { POST } = await import("../route");
    const res = await POST(new NextRequest("http://localhost/api/me/onboarding/complete", { method: "POST" }));
    await runAfterCallbacks();

    expect(res.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect(mockSendTemplateNotification).not.toHaveBeenCalled();
  });

  it("short-circuits for non-customer roles without notifying", async () => {
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "prov-1", role: "provider_owner" } });

    const { POST } = await import("../route");
    const res = await POST(new NextRequest("http://localhost/api/me/onboarding/complete", { method: "POST" }));
    const json = await res.json();
    await runAfterCallbacks();

    expect(json.data).toEqual({ completed: true, portal: "provider_owner" });
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
    expect(mockSendTemplateNotification).not.toHaveBeenCalled();
  });
});
