import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

const mockGetSupabaseAdmin = vi.fn();
const mockSyncProviderVerification = vi.fn();
const mockSlackNotifyNeedsReview = vi.fn();
const mockSlackNotifyRejected = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/verification/sync-provider-verification", () => ({
  syncProviderVerificationState: (...args: unknown[]) => mockSyncProviderVerification(...args),
}));

vi.mock("@/lib/integrations/slack/ops-triggers", () => ({
  slackNotifyVerificationNeedsReview: (...args: unknown[]) => mockSlackNotifyNeedsReview(...args),
  slackNotifyVerificationRejected: (...args: unknown[]) => mockSlackNotifyRejected(...args),
}));

function makeAdmin(opts: {
  webhookSecret?: string;
  provider?: { tenant_id?: string; business_name?: string; user_id?: string } | null;
}) {
  return {
    from(table: string) {
      if (table === "sumsub_integration_config") {
        const configQuery = {
          eq: vi.fn(() => configQuery),
          is: vi.fn(() => configQuery),
          maybeSingle: vi.fn().mockResolvedValue({
            data: opts.webhookSecret
              ? { webhook_secret_secret: opts.webhookSecret }
              : null,
            error: null,
          }),
        };
        return {
          select: () => configQuery,
        };
      }
      if (table === "providers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: opts.provider ?? null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          update: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
        };
      }
      if (table === "user_verifications") {
        return {
          upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function signedBody(body: Record<string, unknown>, secret: string) {
  const raw = JSON.stringify(body);
  const sig = createHmac("sha256", secret).update(raw).digest("hex");
  return { raw, sig };
}

describe("POST /api/webhooks/sumsub provider verification sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockSyncProviderVerification.mockResolvedValue({ ok: true, errors: [] });
  });

  it("fans GREEN provider Sumsub review out to the sync helper as approved", async () => {
    const secret = "whsec_test";
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin({
        webhookSecret: secret,
        provider: { tenant_id: "tenant-1", business_name: "Salon", user_id: "user-1" },
      }),
    );

    const body = {
      applicantId: "applicant-1",
      externalUserId: "00000000-0000-4000-8000-000000000001",
      reviewResult: { reviewAnswer: "GREEN" },
    };
    const { raw, sig } = signedBody(body, secret);

    const req = new NextRequest("https://app.example.com/api/webhooks/sumsub", {
      method: "POST",
      body: raw,
      headers: { "x-payload-digest": sig, "content-type": "application/json" },
    });
    const { POST } = await import("../route");
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockSyncProviderVerification).toHaveBeenCalledTimes(1);
    const args = mockSyncProviderVerification.mock.calls[0]?.[1];
    expect(args?.providerId).toBe("00000000-0000-4000-8000-000000000001");
    expect(args?.userId).toBe("user-1");
    expect(args?.status).toBe("approved");
    expect(args?.source).toBe("sumsub");
    expect(args?.sumsubApplicantId).toBe("applicant-1");
  });

  it("maps RED to rejected and surfaces sync errors as a log", async () => {
    const secret = "whsec_test";
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin({
        webhookSecret: secret,
        provider: { tenant_id: "tenant-1", business_name: "Salon", user_id: "user-1" },
      }),
    );
    mockSyncProviderVerification.mockResolvedValueOnce({ ok: false, errors: ["boom"] });

    const body = {
      applicantId: "applicant-1",
      externalUserId: "00000000-0000-4000-8000-000000000001",
      reviewResult: { reviewAnswer: "RED" },
    };
    const { raw, sig } = signedBody(body, secret);
    const req = new NextRequest("https://app.example.com/api/webhooks/sumsub", {
      method: "POST",
      body: raw,
      headers: { "x-payload-digest": sig, "content-type": "application/json" },
    });

    const { POST } = await import("../route");
    const res = await POST(req);
    expect(res.status).toBe(200);
    const args = mockSyncProviderVerification.mock.calls[0]?.[1];
    expect(args?.status).toBe("rejected");
  });

  it("rejects requests with no valid signature", async () => {
    const secret = "whsec_test";
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin({
        webhookSecret: secret,
        provider: { tenant_id: "tenant-1", business_name: "Salon", user_id: "user-1" },
      }),
    );

    const req = new NextRequest("https://app.example.com/api/webhooks/sumsub", {
      method: "POST",
      body: "{}",
      headers: { "x-payload-digest": "deadbeef", "content-type": "application/json" },
    });

    const { POST } = await import("../route");
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockSyncProviderVerification).not.toHaveBeenCalled();
  });
});
