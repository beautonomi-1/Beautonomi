import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest, MOCK_USERS } from "../../../__tests__/helpers/mock-supabase";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockEnforceAiBudget = vi.fn();
const mockLogAiUsage = vi.fn();
const mockCheckEntitlement = vi.fn();
const mockGetProviderContext = vi.fn();
const mockCallGemini = vi.fn();
const mockTrackServer = vi.fn().mockResolvedValue(undefined);
const mockReadAiCache = vi.fn();
const mockWriteAiCache = vi.fn();
const mockLoadPromptTemplate = vi.fn();
const mockEstimateCostUsd = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  errorResponse: (message: string, code: string, status: number) =>
    new Response(JSON.stringify({ error: { message, code } }), {
      status,
      headers: { "content-type": "application/json" },
    }),
  handleApiError: (error: unknown, message = "Error") =>
    new Response(
      JSON.stringify({ error: { message: `${message}: ${error instanceof Error ? error.message : String(error)}` } }),
      { status: 500, headers: { "content-type": "application/json" } },
    ),
  successResponse: (data: unknown) =>
    new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } }),
}));
vi.mock("@/lib/ai/enforce-budget", () => ({
  enforceAiBudget: (...args: unknown[]) => mockEnforceAiBudget(...args),
  logAiUsage: (...args: unknown[]) => mockLogAiUsage(...args),
}));
vi.mock("@/lib/ai/entitlements", () => ({
  checkProviderAiEntitlement: (...args: unknown[]) => mockCheckEntitlement(...args),
}));
vi.mock("@/lib/ai/provider-context", () => ({
  getProviderContext: (...args: unknown[]) => mockGetProviderContext(...args),
  formatCapsuleForPrompt: (c: unknown) => `ctx:${JSON.stringify(c)}`,
}));
vi.mock("@/lib/ai/gemini", () => ({
  callGemini: (...args: unknown[]) => mockCallGemini(...args),
}));
vi.mock("@/lib/ai/ai-cache", () => ({
  buildAiCacheKeyHash: (...parts: string[]) => parts.join("|"),
  readAiCache: (...args: unknown[]) => mockReadAiCache(...args),
  writeAiCache: (...args: unknown[]) => mockWriteAiCache(...args),
}));
vi.mock("@/lib/ai/prompt-templates", () => ({
  loadPromptTemplate: (...args: unknown[]) => mockLoadPromptTemplate(...args),
}));
vi.mock("@/lib/ai/pricing", () => ({
  estimateCostUsd: (...args: unknown[]) => mockEstimateCostUsd(...args),
}));
vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: (...args: unknown[]) => mockTrackServer(...args),
}));

const CAPSULE = {
  provider_id: "provider-1",
  name: "Glow Studio",
  description: "Nail and brow bar",
  status: "active",
  categories: [],
  locations: [{ city: "Cape Town" }],
  offerings: [{ name: "Gel Manicure", price: 350 }, { name: "Brow Lamination", price: 450 }],
  policies: {},
  stats: {},
};

function adminClientWith(rows: { aiConfig?: unknown; gemini?: unknown }) {
  const from = vi.fn((table: string) => {
    const data = table === "ai_module_config" ? rows.aiConfig ?? null : table === "gemini_integration_config" ? rows.gemini ?? null : null;
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    };
  });
  return { from };
}

async function post(featureKey: string, input?: string) {
  const { POST } = await import("@/app/api/provider/ai/[feature_key]/route");
  const req = createMockNextRequest({
    method: "POST",
    url: `http://localhost:3000/api/provider/ai/${featureKey}`,
    body: input ? { input } : {},
  });
  return POST(req as NextRequest, { params: Promise.resolve({ feature_key: featureKey }) });
}

describe("POST /api/provider/ai/[feature_key]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.provider_owner });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockCheckEntitlement.mockResolvedValue({ allowed: true, entitlement: { max_tokens: 600 } });
    mockGetProviderContext.mockResolvedValue(CAPSULE);
    mockReadAiCache.mockResolvedValue(null);
    mockWriteAiCache.mockResolvedValue(undefined);
    mockLoadPromptTemplate.mockResolvedValue(null);
    mockEstimateCostUsd.mockResolvedValue(0.00042);
    mockLogAiUsage.mockResolvedValue(undefined);
    mockGetSupabaseAdmin.mockReturnValue(
      adminClientWith({ aiConfig: { cache_ttl_seconds: 600 }, gemini: { api_key_secret: "key", default_model: "gemini-2.5-flash-lite" } }),
    );
  });

  it("returns 200 with a template payload and fallback:true when budget says templates_only", async () => {
    mockEnforceAiBudget.mockResolvedValue({
      allowed: false,
      reason: "daily_budget_exceeded",
      fallback_mode: "templates_only",
    });

    const res = await post("ai.provider.content_studio", "spring specials");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.fallback).toBe(true);
    expect(body.data.fallback_reason).toBe("daily_budget_exceeded");
    expect(Array.isArray(body.data.post_captions)).toBe(true);
    expect(body.data.post_captions.length).toBeGreaterThan(0);
    expect(body.data.hashtags).toContain("#Beautonomi");
    expect(body.data.short_description).toContain("Glow Studio");

    expect(mockCallGemini).not.toHaveBeenCalled();
    expect(mockLogAiUsage).not.toHaveBeenCalled();
    expect(mockTrackServer).toHaveBeenCalledWith(
      "ai_feature_called",
      expect.objectContaining({ feature_key: "ai.provider.content_studio", fallback: true, cache_hit: false }),
      MOCK_USERS.provider_owner.id,
    );
  });

  it("profile_completion fallback builds a suggested_profile_patch from the capsule", async () => {
    mockEnforceAiBudget.mockResolvedValue({ allowed: false, reason: "global_spend_cap_exceeded", fallback_mode: "templates_only" });

    const res = await post("ai.provider.profile_completion");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.fallback).toBe(true);
    expect(body.data.suggested_profile_patch.specialties).toEqual(["Gel Manicure", "Brow Lamination"]);
    expect(body.data.suggested_profile_patch.headline).toContain("Glow Studio");
  });

  it("still returns 403 when the module is disabled (fallback_mode off)", async () => {
    mockEnforceAiBudget.mockResolvedValue({ allowed: false, disabled: true, reason: "ai_module_disabled", fallback_mode: "off" });
    const res = await post("ai.provider.content_studio");
    expect(res.status).toBe(403);
  });

  it("uses the DB prompt template + output_schema, parses JSON directly, and logs the computed cost", async () => {
    mockEnforceAiBudget.mockResolvedValue({ allowed: true });
    mockLoadPromptTemplate.mockResolvedValue({
      key: "ai.provider.content_studio",
      version: 2,
      system: "DB SYSTEM",
      userPrompt: "DB USER PROMPT",
      outputSchema: { type: "object", properties: { post_captions: { type: "array", items: { type: "string" } } } },
      source: "db",
    });
    mockCallGemini.mockResolvedValue({
      success: true,
      text: JSON.stringify({ post_captions: ["a"], hashtags: ["#x"], short_description: "d" }),
      tokensIn: 300,
      tokensOut: 120,
    });

    const res = await post("ai.provider.content_studio");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.post_captions).toEqual(["a"]);
    expect(body.data.fallback).toBeUndefined();

    const geminiArgs = mockCallGemini.mock.calls[0][0] as Record<string, unknown>;
    expect(geminiArgs.system).toContain("DB SYSTEM");
    expect(geminiArgs.user).toBe("DB USER PROMPT");
    expect(geminiArgs.schema).toEqual({ type: "object", properties: { post_captions: { type: "array", items: { type: "string" } } } });
    expect(geminiArgs.providerId).toBe("provider-1");
    expect(geminiArgs.featureKey).toBe("ai.provider.content_studio");

    expect(mockEstimateCostUsd).toHaveBeenCalledWith("gemini-2.5-flash-lite", 300, 120);
    expect(mockLogAiUsage).toHaveBeenCalledWith(expect.objectContaining({ cost_estimate: 0.00042, tokens_in: 300, tokens_out: 120 }));
    expect(mockWriteAiCache).toHaveBeenCalledTimes(1);
    expect(mockTrackServer).toHaveBeenCalledWith(
      "ai_feature_called",
      expect.objectContaining({ cache_hit: false, fallback: false, template_source: "db", tokens_in: 300, tokens_out: 120, cost_usd: 0.00042 }),
      MOCK_USERS.provider_owner.id,
    );
  });

  it("serves cache hits without calling Gemini and reports cache_hit", async () => {
    mockEnforceAiBudget.mockResolvedValue({ allowed: true });
    mockReadAiCache.mockResolvedValue({ post_captions: ["cached"], hashtags: [], short_description: "c" });

    const res = await post("ai.provider.content_studio");
    expect(res.status).toBe(200);
    expect((await res.json()).data.post_captions).toEqual(["cached"]);
    expect(mockCallGemini).not.toHaveBeenCalled();
    expect(mockTrackServer).toHaveBeenCalledWith(
      "ai_feature_called",
      expect.objectContaining({ cache_hit: true }),
      MOCK_USERS.provider_owner.id,
    );
  });

  it("maps GEMINI_RATE_LIMITED to 429", async () => {
    mockEnforceAiBudget.mockResolvedValue({ allowed: true });
    mockCallGemini.mockResolvedValue({ success: false, errorCode: "GEMINI_RATE_LIMITED", text: "", tokensIn: 0, tokensOut: 0 });
    const res = await post("ai.provider.content_studio");
    expect(res.status).toBe(429);
  });

  it("404s unknown feature keys (stubs are not shipped)", async () => {
    mockEnforceAiBudget.mockResolvedValue({ allowed: true });
    for (const key of ["ai.provider.smart_replies", "ai.provider.pricing_assistant", "ai.provider.booking_ops", "ai.provider.reputation_coach"]) {
      const res = await post(key);
      expect(res.status).toBe(404);
    }
  });
});
