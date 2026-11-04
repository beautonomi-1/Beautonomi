import { describe, it, expect, vi, beforeEach } from "vitest";
import { MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

const mockRequireAdminSection = vi.fn();
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAdminSection: (...args: unknown[]) => mockRequireAdminSection(...args),
  };
});

const mockResolveAdminApiTenantId = vi.fn();
vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: (...args: unknown[]) => mockResolveAdminApiTenantId(...args),
}));

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
  extractRequestMeta: () => ({ ip: "127.0.0.1" }),
}));

const mockIsExploreVideoTranscodeEnabled = vi.fn();
vi.mock("@/lib/explore/explore-feature-gates", () => ({
  isExploreVideoTranscodeEnabled: (...args: unknown[]) => mockIsExploreVideoTranscodeEnabled(...args),
}));

const mockLoadRendobarSecrets = vi.fn();
const mockRendobarIntegrationReady = vi.fn();
vi.mock("@/lib/explore/rendobar-config", () => ({
  loadRendobarSecrets: (...args: unknown[]) => mockLoadRendobarSecrets(...args),
  rendobarIntegrationReady: (...args: unknown[]) => mockRendobarIntegrationReady(...args),
}));

const mockEnqueueExploreVideoProcessing = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/explore/enqueue-video-processing", () => ({
  enqueueExploreVideoProcessing: (...args: unknown[]) => mockEnqueueExploreVideoProcessing(...args),
}));

const updateEq = vi.fn().mockResolvedValue({ error: null });
const updateMock = vi.fn().mockReturnValue({ eq: updateEq });
const maybeSingle = vi.fn();
const eqId = vi.fn().mockReturnValue({ maybeSingle });
const fromMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eqId }) });

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, update: updateMock }),
}));

function makeRequest(body: object = {}) {
  return {
    method: "POST",
    url: "http://localhost/api/admin/explore/posts/post-1/reprocess",
    headers: { get: () => null },
    json: vi.fn().mockResolvedValue(body),
  } as any;
}

describe("POST /api/admin/explore/posts/[id]/reprocess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminSection.mockResolvedValue({
      user: { id: MOCK_USERS.superadmin.id, role: MOCK_USERS.superadmin.role },
    });
    mockResolveAdminApiTenantId.mockResolvedValue("tenant-za");
    mockIsExploreVideoTranscodeEnabled.mockResolvedValue(true);
    mockLoadRendobarSecrets.mockResolvedValue({});
    mockRendobarIntegrationReady.mockReturnValue(true);
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "post-1",
              provider_id: "prov-1",
              status: "published",
              media_urls: ["u1.mp4"],
              media_meta: [{ kind: "video", status: "failed" }],
              playback_path: null,
              providers: { tenant_id: "tenant-za" },
            },
            error: null,
          }),
        }),
      }),
      update: updateMock,
    });
    updateMock.mockReturnValue({ eq: updateEq });
  });

  it("returns 409 when transcode is unavailable", async () => {
    mockIsExploreVideoTranscodeEnabled.mockResolvedValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "post-1" }) });
    expect(res.status).toBe(409);
  });

  it("resets slides, enqueues processing, and writes audit on success", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "post-1" }) });
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
    expect(mockEnqueueExploreVideoProcessing).toHaveBeenCalledWith("post-1");
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin.explore.post.reprocess" }),
    );
  });
});
