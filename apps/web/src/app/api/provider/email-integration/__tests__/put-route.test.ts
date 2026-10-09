import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockCheckMarketingFeatureAccess = vi.fn();
const mockPingMailchimpTransactional = vi.fn();
const mockValidateEmailApiKeyForProvider = vi.fn();

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
  checkMarketingFeatureAccess: (...args: unknown[]) => mockCheckMarketingFeatureAccess(...args),
}));

vi.mock("@/lib/marketing/send-via-mailchimp", () => ({
  validateEmailApiKeyForProvider: (...args: unknown[]) => mockValidateEmailApiKeyForProvider(...args),
  pingMailchimpTransactional: (...args: unknown[]) => mockPingMailchimpTransactional(...args),
  isMailchimpMarketingApiKey: (key: string) => /^[a-f0-9]{32}-[a-z]{2}\d+$/i.test(key.trim()),
}));

type ExistingRow = {
  id: string;
  api_key: string;
  api_secret?: string;
  provider_name: "sendgrid" | "mailchimp";
  connected_date?: string | null;
};

function makeSupabase(existing: ExistingRow | null) {
  return {
    from: vi.fn(() => {
      let writeResult: { data: Record<string, unknown>; error: null } | null = null;
      const chain: Record<string, unknown> = {};
      const passthrough = () => chain;
      chain.select = vi.fn(passthrough);
      chain.eq = vi.fn(passthrough);
      chain.maybeSingle = vi.fn(async () => ({ data: existing, error: null }));
      chain.update = vi.fn((row: Record<string, unknown>) => {
        writeResult = {
          data: { id: existing?.id ?? "new-id", ...existing, ...row },
          error: null,
        };
        return chain;
      });
      chain.insert = vi.fn((row: Record<string, unknown>) => {
        writeResult = { data: { id: "new-id", ...row }, error: null };
        return chain;
      });
      chain.single = vi.fn(async () => writeResult ?? { data: null, error: null });
      chain.then = (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
        Promise.resolve(writeResult ?? { data: null, error: null }).then(onFulfilled, onRejected);
      return chain;
    }),
  };
}

function putRequest(body: unknown) {
  return new NextRequest("http://localhost/api/provider/email-integration", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/provider/email-integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "u1", role: "provider_owner" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockCheckMarketingFeatureAccess.mockResolvedValue({ customIntegrations: true });
    mockGetSupabaseServer.mockResolvedValue(makeSupabase(null));
    mockValidateEmailApiKeyForProvider.mockImplementation((provider: string, key: string) => {
      if (provider === "sendgrid" && !key.startsWith("SG.")) return "Invalid SendGrid API key format. Should start with 'SG.'";
      if (provider === "mailchimp" && /^[a-f0-9]{32}-[a-z]{2}\d+$/i.test(key)) {
        return "This looks like a Mailchimp Marketing API key (Profile → Extras → API keys). Use a Mailchimp Transactional key from Transactional → Settings → API Keys.";
      }
      if (provider === "mailchimp" && key.startsWith("SG.")) {
        return "SendGrid API keys cannot be used for Mailchimp Transactional. Enter a Mailchimp Transactional API key.";
      }
      return null;
    });
    mockPingMailchimpTransactional.mockResolvedValue({ ok: true });
  });

  it("rejects Mailchimp Marketing API key shape on create", async () => {
    const { PUT } = await import("../route");
    const marketingKey = "a1b2c3d4e5f6789012345678abcdef01-xx1";
    const res = await PUT(
      putRequest({
        provider_name: "mailchimp",
        api_key: marketingKey,
        from_email: "hello@example.com",
        is_enabled: false,
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.message ?? json.message).toMatch(/Marketing API key/i);
    expect(mockPingMailchimpTransactional).not.toHaveBeenCalled();
  });

  it("rejects switching provider with masked key", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      makeSupabase({
        id: "int-1",
        provider_name: "sendgrid",
        api_key: "SG.existing",
      }),
    );
    const { PUT } = await import("../route");
    const res = await PUT(
      putRequest({
        provider_name: "mailchimp",
        api_key: "••••••••",
        from_email: "hello@example.com",
        is_enabled: false,
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.message ?? json.message).toMatch(/switching email providers/i);
  });

  it("rejects resolved SendGrid key when provider is mailchimp", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      makeSupabase({
        id: "int-1",
        provider_name: "mailchimp",
        api_key: "SG.wrong-for-mailchimp",
      }),
    );
    const { PUT } = await import("../route");
    const res = await PUT(
      putRequest({
        provider_name: "mailchimp",
        api_key: "••••••••",
        from_email: "hello@example.com",
        is_enabled: false,
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.message ?? json.message).toMatch(/SendGrid API keys cannot be used/i);
  });

  it("pings Mandrill when saving new Mailchimp key", async () => {
    const { PUT } = await import("../route");
    const res = await PUT(
      putRequest({
        provider_name: "mailchimp",
        api_key: "mandrill-new-key",
        from_email: "hello@verified.example",
        is_enabled: false,
      }),
    );
    expect(res.status).toBe(200);
    expect(mockPingMailchimpTransactional).toHaveBeenCalledWith("mandrill-new-key");
  });

  it("skips Mandrill ping when key is masked and provider unchanged", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      makeSupabase({
        id: "int-1",
        provider_name: "mailchimp",
        api_key: "mandrill-stored",
      }),
    );
    const { PUT } = await import("../route");
    const res = await PUT(
      putRequest({
        provider_name: "mailchimp",
        api_key: "••••••••",
        from_email: "hello@verified.example",
        is_enabled: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(mockPingMailchimpTransactional).not.toHaveBeenCalled();
  });
});
