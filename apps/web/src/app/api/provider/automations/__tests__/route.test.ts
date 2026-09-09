import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockCheckAutomationFeatureAccess = vi.fn();
const mockCheckMarketingFeatureAccess = vi.fn();
const mockCanUseMarketingChannel = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/subscriptions/feature-access", () => ({
  checkAutomationFeatureAccess: (...args: unknown[]) => mockCheckAutomationFeatureAccess(...args),
  checkMarketingFeatureAccess: (...args: unknown[]) => mockCheckMarketingFeatureAccess(...args),
  canUseMarketingChannel: (...args: unknown[]) => mockCanUseMarketingChannel(...args),
}));

type Row = Record<string, unknown>;

/**
 * Minimal thenable query builder. `select(...).eq(...).eq(...)` resolves to the
 * list result; `.single()` resolves to `existing`; `insert`/`update` switch the
 * result to the written row.
 */
function makeSupabase(opts: { existingList?: Row[]; existing?: Row | null } = {}) {
  return {
    from: vi.fn(() => {
      let result: { data: unknown; error: null } = {
        data: opts.existingList ?? [],
        error: null,
      };
      let mutated = false;
      const c: Record<string, unknown> = {};
      const passthrough = () => c;
      c.select = vi.fn(passthrough);
      c.eq = vi.fn(passthrough);
      c.limit = vi.fn(passthrough);
      c.order = vi.fn(passthrough);
      c.single = vi.fn(() => {
        if (!mutated) result = { data: opts.existing ?? null, error: null };
        return c;
      });
      c.insert = vi.fn((row: Row) => {
        mutated = true;
        result = { data: { id: "auto-new", ...row }, error: null };
        return c;
      });
      c.update = vi.fn((row: Row) => {
        mutated = true;
        result = { data: { id: "auto-1", ...(opts.existing ?? {}), ...row }, error: null };
        return c;
      });
      c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(result).then(res, rej);
      return c;
    }),
  };
}

function jsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function useStarterTier() {
  mockCheckAutomationFeatureAccess.mockResolvedValue({ enabled: true, maxAutomations: 10 });
  mockCheckMarketingFeatureAccess.mockResolvedValue({
    enabled: false,
    channels: [],
    advancedSegmentation: false,
    customIntegrations: false,
    usePlatformCredentials: false,
  });
  mockCanUseMarketingChannel.mockResolvedValue(false);
}

function useGrowthTier() {
  mockCheckAutomationFeatureAccess.mockResolvedValue({ enabled: true, maxAutomations: 40 });
  mockCheckMarketingFeatureAccess.mockResolvedValue({
    enabled: true,
    channels: ["email", "sms"],
    advancedSegmentation: true,
    customIntegrations: false,
    usePlatformCredentials: true,
  });
  mockCanUseMarketingChannel.mockImplementation(async (_p: string, channel: string) =>
    ["email", "sms"].includes(channel),
  );
}

const baseAutomation = {
  name: "Reminder",
  trigger_type: "appointment_reminder",
  trigger_config: { hours_before: 24 },
  action_config: { message_template: "Hi {{name}}" },
};

describe("POST /api/provider/automations — plan channel gate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "u1" } });
    mockGetProviderIdForUser.mockResolvedValue("p1");
    mockGetSupabaseServer.mockResolvedValue(makeSupabase());
  });

  it("Starter: email automation → 403 SUBSCRIPTION_REQUIRED", async () => {
    useStarterTier();
    const { POST } = await import("../route");
    const res = await POST(
      jsonRequest("http://localhost/api/provider/automations", "POST", {
        ...baseAutomation,
        action_type: "email",
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("SUBSCRIPTION_REQUIRED");
  });

  it("Starter: notification automation is allowed", async () => {
    useStarterTier();
    const { POST } = await import("../route");
    const res = await POST(
      jsonRequest("http://localhost/api/provider/automations", "POST", {
        ...baseAutomation,
        action_type: "notification",
      }),
    );
    const body = await res.json();
    expect(res.ok).toBe(true);
    expect(body.data.action_type).toBe("notification");
    expect(mockCheckMarketingFeatureAccess).not.toHaveBeenCalled();
  });

  it("Growth: email automation is allowed", async () => {
    useGrowthTier();
    const { POST } = await import("../route");
    const res = await POST(
      jsonRequest("http://localhost/api/provider/automations", "POST", {
        ...baseAutomation,
        action_type: "email",
      }),
    );
    expect(res.ok).toBe(true);
  });

  it("Growth: whatsapp automation → 403 (channel not on plan)", async () => {
    useGrowthTier();
    const { POST } = await import("../route");
    const res = await POST(
      jsonRequest("http://localhost/api/provider/automations", "POST", {
        ...baseAutomation,
        action_type: "whatsapp",
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("SUBSCRIPTION_REQUIRED");
  });
});

describe("PATCH /api/provider/automations/[id] — plan channel gate", () => {
  const params = { params: Promise.resolve({ id: "auto-1" }) };
  const existingNotification = {
    id: "auto-1",
    action_type: "notification",
    is_active: true,
    action_config: {},
    trigger_config: {},
  };
  const existingEmailInactive = {
    id: "auto-1",
    action_type: "email",
    is_active: false,
    action_config: {},
    trigger_config: {},
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "u1" } });
    mockGetProviderIdForUser.mockResolvedValue("p1");
  });

  it("Starter: flipping action_type to sms → 403", async () => {
    useStarterTier();
    mockGetSupabaseServer.mockResolvedValue(makeSupabase({ existing: existingNotification }));
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      jsonRequest("http://localhost/api/provider/automations/auto-1", "PATCH", {
        action_type: "sms",
      }),
      params,
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("SUBSCRIPTION_REQUIRED");
  });

  it("Starter: re-activating an existing email automation → 403", async () => {
    useStarterTier();
    mockGetSupabaseServer.mockResolvedValue(makeSupabase({ existing: existingEmailInactive }));
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      jsonRequest("http://localhost/api/provider/automations/auto-1", "PATCH", {
        is_active: true,
      }),
      params,
    );
    expect(res.status).toBe(403);
  });

  it("Starter: renaming a notification automation is allowed", async () => {
    useStarterTier();
    mockGetSupabaseServer.mockResolvedValue(makeSupabase({ existing: existingNotification }));
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      jsonRequest("http://localhost/api/provider/automations/auto-1", "PATCH", {
        name: "Renamed",
      }),
      params,
    );
    expect(res.ok).toBe(true);
    expect(mockCheckMarketingFeatureAccess).not.toHaveBeenCalled();
  });

  it("Growth: flipping action_type to sms is allowed", async () => {
    useGrowthTier();
    mockGetSupabaseServer.mockResolvedValue(makeSupabase({ existing: existingNotification }));
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      jsonRequest("http://localhost/api/provider/automations/auto-1", "PATCH", {
        action_type: "sms",
      }),
      params,
    );
    expect(res.ok).toBe(true);
  });
});
