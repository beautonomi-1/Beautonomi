import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAdminFrom = vi.fn();
let mockUpsert: ReturnType<typeof vi.fn>;

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mockAdminFrom }),
}));

// We deliberately re-import the module per test so env-var fallbacks reset.
async function loadOauth() {
  vi.resetModules();
  return await import("../yoco-oauth");
}

/**
 * Build a chainable Supabase-PostgREST stub. `result` is the row (or null);
 * `maybeSingle()` resolves to `{ data, error }` matching the live client.
 */
function chainable(result: unknown) {
  const obj: Record<string, any> = {
    select: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    is: vi.fn(() => obj),
    limit: vi.fn(() => obj),
    order: vi.fn(() => obj),
    maybeSingle: vi.fn(async () => ({ data: result, error: null })),
    single: vi.fn(async () => ({ data: result, error: null })),
  };
  return obj;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({
        data: { provider_id: "p1", access_token: "new-token" },
        error: null,
      })),
    })),
  }));
  delete process.env.YOCO_OAUTH_CLIENT_ID;
  delete process.env.YOCO_OAUTH_CLIENT_SECRET;
  delete process.env.YOCO_OAUTH_REDIRECT_URI;
  delete process.env.YOCO_OAUTH_CLIENT_ID_SANDBOX;
});

describe("resolveOauthApp", () => {
  it("prefers tenant row over global row", async () => {
    const { resolveOauthApp } = await loadOauth();
    const tenantResult = {
      client_id: "tenant-id",
      client_secret: "tenant-secret",
      redirect_uri: "https://tenant.example/cb",
      default_scopes: "openid",
      is_enabled: true,
    };
    mockAdminFrom.mockImplementation(() => chainable(tenantResult));
    const app = await resolveOauthApp("tenant-1", "live");
    expect(app.source).toBe("tenant");
    expect(app.clientId).toBe("tenant-id");
  });

  it("falls back to global row when no tenant override", async () => {
    const { resolveOauthApp } = await loadOauth();
    // tenantId is null so only the global lookup runs; return the global row.
    mockAdminFrom.mockImplementation(() =>
      chainable({
        client_id: "global-id",
        client_secret: "global-secret",
        redirect_uri: "https://global.example/cb",
        default_scopes: "openid",
        is_enabled: true,
      }),
    );
    const app = await resolveOauthApp(null, "live");
    expect(app.source).toBe("global");
    expect(app.clientId).toBe("global-id");
  });

  it("falls back to env vars when nothing in DB", async () => {
    process.env.YOCO_OAUTH_CLIENT_ID = "env-id";
    process.env.YOCO_OAUTH_CLIENT_SECRET = "env-secret";
    process.env.YOCO_OAUTH_REDIRECT_URI = "https://env.example/cb";
    const { resolveOauthApp } = await loadOauth();
    mockAdminFrom.mockImplementation(() => chainable(null));
    const app = await resolveOauthApp(null, "live");
    expect(app.source).toBe("env");
    expect(app.clientId).toBe("env-id");
    expect(app.redirectUri).toBe("https://env.example/cb");
  });

  it("throws YocoOAuthRequired when nothing is configured", async () => {
    const { resolveOauthApp, YocoOAuthRequired } = await loadOauth();
    mockAdminFrom.mockImplementation(() => chainable(null));
    await expect(resolveOauthApp(null, "live")).rejects.toBeInstanceOf(
      YocoOAuthRequired,
    );
  });
});

describe("DEFAULT_YOCO_SCOPES", () => {
  /**
   * §Yoco-OAuth audit 2026-05: Yoco's consent screen rejects unknown scopes
   * (https://developer.yoco.com/docs/api/authentication/scopes). Lock in the
   * exact scope set we ship so a future "let's just add another scope" PR
   * cannot silently re-introduce an undocumented token and break the flow.
   */
  it("only requests scopes that exist in Yoco's published catalog", async () => {
    const { DEFAULT_YOCO_SCOPES } = await loadOauth();
    const requested = DEFAULT_YOCO_SCOPES.split(/\s+/).filter(Boolean);
    const ALLOWED = new Set([
      "openid",
      "offline_access",
      "profile",
      "application/webhooks:read",
      "application/webhooks:write",
      "business/capital_advances:read",
      "business/capital_offers:read",
      "business/catalogue:read",
      "business/locations:read",
      "business/orders:read",
      "business/orders:write",
      "business/payouts:read",
      "business/webpos:read",
      "business/webpos:write",
      "business/webhooks:read",
      "business/webhooks:write",
    ]);
    const invalid = requested.filter((s) => !ALLOWED.has(s));
    expect(invalid).toEqual([]);
  });

  it("requests the minimum scopes Beautonomi calls today", async () => {
    const { DEFAULT_YOCO_SCOPES } = await loadOauth();
    const requested = DEFAULT_YOCO_SCOPES.split(/\s+/).filter(Boolean);
    for (const required of [
      "openid",
      "offline_access",
      "business/webpos:read",
      "business/webpos:write",
      "application/webhooks:read",
      "application/webhooks:write",
    ]) {
      expect(requested).toContain(required);
    }
  });

  it("does NOT request scopes Yoco's docs no longer publish", async () => {
    const { DEFAULT_YOCO_SCOPES } = await loadOauth();
    const requested = DEFAULT_YOCO_SCOPES.split(/\s+/).filter(Boolean);
    for (const deprecated of [
      "business/payments:read",
      "business/payments:write",
      "business/refunds:read",
      "business/refunds:write",
      "business/webhooks:write",
    ]) {
      expect(requested).not.toContain(deprecated);
    }
  });
});

describe("buildAuthorizeUrl", () => {
  it("encodes scope + state + client_id and points at the right host", async () => {
    const { buildAuthorizeUrl } = await loadOauth();
    const url = buildAuthorizeUrl({
      app: {
        source: "env",
        tenantId: null,
        environment: "live",
        clientId: "client-x",
        clientSecret: "secret",
        redirectUri: "https://app/cb",
        defaultScopes: "openid offline_access",
      },
      state: "state-abc",
    });
    expect(url.startsWith("https://iam.yoco.com/oauth2/authorize?")).toBe(true);
    expect(url).toContain("client_id=client-x");
    expect(url).toContain("state=state-abc");
    expect(url).toContain("scope=openid+offline_access");
  });

  it("uses the sandbox host when environment is sandbox", async () => {
    const { buildAuthorizeUrl } = await loadOauth();
    const url = buildAuthorizeUrl({
      app: {
        source: "env",
        tenantId: null,
        environment: "sandbox",
        clientId: "c",
        clientSecret: "s",
        redirectUri: "https://app/cb",
        defaultScopes: "openid",
      },
      state: "abc",
    });
    expect(url.startsWith("https://iam.yocosandbox.com/")).toBe(true);
  });
});

describe("getValidAccessToken", () => {
  it("returns existing access_token when it is comfortably in the future", async () => {
    const { getValidAccessToken } = await loadOauth();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "provider_yoco_oauth_tokens") {
        return chainable({
          provider_id: "p1",
          tenant_id: null,
          environment: "live",
          access_token: "fresh-token",
          refresh_token: "ref",
          token_type: "bearer",
          scope: "openid",
          expires_at: future,
        });
      }
      return chainable(null);
    });
    const token = await getValidAccessToken("p1");
    expect(token).toBe("fresh-token");
  });

  it("throws YocoOAuthRequired when there is no token row", async () => {
    const { getValidAccessToken, YocoOAuthRequired } = await loadOauth();
    mockAdminFrom.mockImplementation(() => chainable(null));
    await expect(getValidAccessToken("p1")).rejects.toBeInstanceOf(YocoOAuthRequired);
  });

  it("refreshes when expiry is within the 5-minute lead time", async () => {
    process.env.YOCO_OAUTH_CLIENT_ID = "cid";
    process.env.YOCO_OAUTH_CLIENT_SECRET = "csec";
    process.env.YOCO_OAUTH_REDIRECT_URI = "https://app/cb";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "rotated-token",
            refresh_token: "new-ref",
            token_type: "bearer",
            expires_in: 86400,
            scope: "openid",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    const { getValidAccessToken } = await loadOauth();
    const aboutToExpire = new Date(Date.now() + 60_000).toISOString();
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "provider_yoco_oauth_tokens") {
        const tokenRow = {
          provider_id: "p1",
          tenant_id: null,
          environment: "live",
          access_token: "stale-token",
          refresh_token: "old-ref",
          token_type: "bearer",
          scope: "openid",
          expires_at: aboutToExpire,
        };
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: tokenRow, error: null })),
              })),
            })),
          })),
          upsert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { access_token: "rotated-token" },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          })),
        };
      }
      // tenant_yoco_oauth_apps — return nothing so we fall back to env vars.
      return chainable(null);
    });
    const token = await getValidAccessToken("p1");
    expect(token).toBe("rotated-token");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://iam.yoco.com/oauth2/token",
      expect.objectContaining({ method: "POST" }),
    );
    fetchSpy.mockRestore();
  });
});

describe("decodeIdTokenPayload", () => {
  it("returns parsed claims for a well-formed id_token", async () => {
    const { decodeIdTokenPayload } = await loadOauth();
    const payload = Buffer.from(
      JSON.stringify({ user_email: "owner@salon.com", user_name: "My Salon" }),
    ).toString("base64");
    const idToken = `header.${payload.replace(/=+$/, "")}.sig`;
    const claims = decodeIdTokenPayload(idToken);
    expect(claims.user_email).toBe("owner@salon.com");
    expect(claims.user_name).toBe("My Salon");
  });

  it("returns empty object for malformed tokens", async () => {
    const { decodeIdTokenPayload } = await loadOauth();
    expect(decodeIdTokenPayload("not-a-jwt")).toEqual({});
  });
});
