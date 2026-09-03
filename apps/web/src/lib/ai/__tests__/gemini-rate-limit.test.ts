import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCheckRateLimit = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("@/lib/rate-limit/store", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { callGemini, GEMINI_PROVIDER_RATE_LIMIT } from "../gemini";

function okResponse(body: unknown) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body } as unknown as Response;
}

describe("callGemini shared rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the shared rate-limit store keyed by provider and returns GEMINI_RATE_LIMITED when exhausted", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 30 });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await callGemini({
      apiKey: "k",
      model: "gemini-2.5-flash-lite",
      user: "hi",
      providerId: "provider-1",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("GEMINI_RATE_LIMITED");
    expect(mockCheckRateLimit).toHaveBeenCalledWith(GEMINI_PROVIDER_RATE_LIMIT, "provider-1");
    expect(GEMINI_PROVIDER_RATE_LIMIT.prefix).toBe("gemini:provider");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the limiter when no providerId is given (agent callers)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okResponse({
          candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
      ),
    );

    const result = await callGemini({ apiKey: "k", model: "gemini-2.0-flash", user: "hi" });

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("returns token counts from usage metadata and sends responseSchema when provided", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29 });
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        candidates: [{ content: { parts: [{ text: "{\"a\":1}" }] } }],
        usageMetadata: { promptTokenCount: 123, candidatesTokenCount: 45, totalTokenCount: 168 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await callGemini({
      apiKey: "k",
      model: "gemini-2.5-flash-lite",
      user: "hi",
      providerId: "provider-1",
      schema: { type: "object", properties: { a: { type: "number" } } },
    });

    expect(result).toMatchObject({ success: true, tokensIn: 123, tokensOut: 45, text: "{\"a\":1}" });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema).toEqual({ type: "object", properties: { a: { type: "number" } } });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("reports non-429 HTTP failures to Sentry tagged with feature_key and model", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal",
        json: async () => ({ error: { message: "boom" } }),
      } as unknown as Response),
    );

    const result = await callGemini({
      apiKey: "k",
      model: "gemini-2.5-flash",
      user: "hi",
      providerId: "provider-1",
      featureKey: "ai.provider.content_studio",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("GEMINI_500");
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [, ctx] = mockCaptureException.mock.calls[0] as [Error, { tags: Record<string, string> }];
    expect(ctx.tags).toMatchObject({
      source: "gemini",
      feature_key: "ai.provider.content_studio",
      model: "gemini-2.5-flash",
      http_status: "500",
    });
  });

  it("fails open when the rate-limit store throws", async () => {
    mockCheckRateLimit.mockRejectedValue(new Error("redis down"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okResponse({ candidates: [{ content: { parts: [{ text: "ok" }] } }], usageMetadata: {} }),
      ),
    );

    const result = await callGemini({ apiKey: "k", model: "gemini-2.0-flash", user: "hi", providerId: "p" });
    expect(result.success).toBe(true);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
