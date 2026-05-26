import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const adminFromMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: adminFromMock }),
}));

const exchangeCodeForTokenMock = vi.fn();
const upsertProviderTokensMock = vi.fn();
const resolveOauthAppMock = vi.fn();
const isFeatureEnabledServerMock = vi.fn();

vi.mock("@/lib/server/feature-flags", () => ({
  isFeatureEnabledServer: (...args: unknown[]) => isFeatureEnabledServerMock(...args),
}));

vi.mock("@/lib/payments/yoco-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/yoco-oauth")>();
  return {
    ...actual,
    exchangeCodeForToken: (...args: unknown[]) => exchangeCodeForTokenMock(...args),
    upsertProviderTokens: (...args: unknown[]) => upsertProviderTokensMock(...args),
    resolveOauthApp: (...args: unknown[]) => resolveOauthAppMock(...args),
  };
});

function makeStateLookup(stateRow: unknown) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: stateRow })),
      })),
    })),
    delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
  };
}

function makeWebhookLookup(existing: unknown = null) {
  const chain: any = {
    eq: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: existing })),
  };
  return {
    select: vi.fn(() => chain),
    insert: vi.fn(async () => ({ error: null })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  exchangeCodeForTokenMock.mockResolvedValue({
    access_token: "tok",
    refresh_token: "ref",
    token_type: "bearer",
    expires_in: 1209600,
    scope: "openid",
  });
  upsertProviderTokensMock.mockResolvedValue({ access_token: "tok" });
  resolveOauthAppMock.mockResolvedValue({
    source: "env",
    tenantId: null,
    environment: "live",
    clientId: "c",
    clientSecret: "s",
    redirectUri: "https://app/cb",
    defaultScopes: "openid",
  });
  isFeatureEnabledServerMock.mockResolvedValue(true);
});

describe("GET /api/provider/yoco/oauth/callback", () => {
  it("redirects with yoco_error when state is missing", async () => {
    adminFromMock.mockImplementation(() => makeStateLookup(null));
    const { GET } = await import("../callback/route");
    const res = await GET(new NextRequest("https://app/api/provider/yoco/oauth/callback?code=abc"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location") || "").toContain("yoco_error=");
  });

  it("redirects with yoco_error when state row is unknown", async () => {
    adminFromMock.mockImplementation(() => makeStateLookup(null));
    const { GET } = await import("../callback/route");
    const res = await GET(
      new NextRequest("https://app/api/provider/yoco/oauth/callback?code=abc&state=unknown")
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location") || "").toContain("yoco_error=invalid_state");
  });

  it("redirects with yoco_error when state is expired", async () => {
    adminFromMock.mockImplementation(() =>
      makeStateLookup({
        state: "s",
        provider_id: "p1",
        tenant_id: null,
        environment: "live",
        return_to: "/provider/settings/sales/yoco-integration",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      })
    );
    const { GET } = await import("../callback/route");
    const res = await GET(
      new NextRequest("https://app/api/provider/yoco/oauth/callback?code=abc&state=s")
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location") || "").toContain("yoco_error=state_expired_please_retry");
  });

  it("sanitizes malicious return_to values from the state row", async () => {
    adminFromMock.mockImplementation(() =>
      makeStateLookup({
        state: "s",
        provider_id: "p1",
        tenant_id: null,
        environment: "live",
        return_to: "https://evil.example/phish",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      })
    );
    const { GET } = await import("../callback/route");
    const res = await GET(
      new NextRequest("https://app/api/provider/yoco/oauth/callback?code=abc&state=s")
    );
    const location = res.headers.get("location") || "";
    expect(location.startsWith("https://app/provider/settings/sales/yoco-integration")).toBe(true);
    expect(location).not.toContain("evil.example");
  });

  it("exchanges code, upserts tokens, and redirects with yoco_connected=1", async () => {
    let stateLookupBuilder = makeStateLookup({
      state: "s",
      provider_id: "p1",
      tenant_id: null,
      environment: "live",
      return_to: "/provider/settings/sales/yoco-integration",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    adminFromMock.mockImplementation((table: string) => {
      if (table === "yoco_oauth_states") return stateLookupBuilder;
      if (table === "provider_yoco_integrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null })),
            })),
          })),
          upsert: vi.fn(async () => ({ error: null })),
        };
      }
      // webhook subscription auto-registration
      if (table === "provider_yoco_webhooks") {
        return makeWebhookLookup(null);
      }
      return makeStateLookup(null);
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "wh_123", secret: "sec_123" }), { status: 201 }),
    );

    const { GET } = await import("../callback/route");
    const res = await GET(
      new NextRequest("https://app/api/provider/yoco/oauth/callback?code=abc&state=s")
    );
    expect(exchangeCodeForTokenMock).toHaveBeenCalled();
    expect(upsertProviderTokensMock).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: "p1", environment: "live" })
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location") || "").toContain("yoco_connected=1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.yoco.com/v1/webhooks/subscriptions/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "beautonomi-default",
          notification_url: "https://app/api/provider/yoco/webhook",
          event_types: ["payment.created", "payment.refunded"],
        }),
      }),
    );
  });
});
