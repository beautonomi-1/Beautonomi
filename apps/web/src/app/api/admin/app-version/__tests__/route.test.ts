/**
 * Admin app-version API: customer + provider native settings via getSupabaseAdmin.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MOCK_USERS } from "@/__tests__/helpers/mock-supabase";
import { getNativeAppCodebaseVersions } from "@/lib/store/native-app-version";

const codebaseVersions = getNativeAppCodebaseVersions();

const mockRequireAdminSection = vi.fn();
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAdminSection: (...args: unknown[]) => mockRequireAdminSection(...args),
  };
});

const mockGetSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

const customerLatest = codebaseVersions.customer ?? "1.0.0";
const providerLatest = codebaseVersions.provider ?? "1.0.0";

const validPair = {
  ios: {
    min_version: "1.0.0",
    latest_version: customerLatest,
    force_update: false,
    update_url: "https://apps.apple.com/app/beautonomi",
  },
  android: {
    min_version: "1.0.0",
    latest_version: customerLatest,
    force_update: false,
    update_url: "https://play.google.com/store/apps/details?id=com.beautonomi",
  },
};

const validBody = {
  customer: {
    ios: { ...validPair.ios, min_version: "1.0.0", latest_version: customerLatest },
    android: { ...validPair.android, force_update: true, latest_version: customerLatest },
  },
  provider: {
    ios: {
      ...validPair.ios,
      min_version: "1.0.0",
      latest_version: providerLatest,
    },
    android: {
      ...validPair.android,
      min_version: "1.0.0",
      latest_version: providerLatest,
    },
  },
};

describe("/api/admin/app-version", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminSection.mockResolvedValue({
      user: { id: MOCK_USERS.superadmin.id, role: MOCK_USERS.superadmin.role },
    });
  });

  describe("GET", () => {
    it("returns 200 with customer and provider from DB", async () => {
      const rows = [
        {
          app: "customer",
          platform: "ios",
          min_version: "1.2.0",
          latest_version: "1.3.0",
          force_update: false,
          update_url: "https://apps.apple.com/app/example",
        },
        {
          app: "customer",
          platform: "android",
          min_version: "1.2.0",
          latest_version: "1.3.0",
          force_update: true,
          update_url: "https://play.google.com/store/apps/details?id=com.example",
        },
        {
          app: "provider",
          platform: "ios",
          min_version: "3.0.0",
          latest_version: "3.0.0",
          force_update: false,
          update_url: "https://apps.apple.com/app/prov",
        },
        {
          app: "provider",
          platform: "android",
          min_version: "3.0.0",
          latest_version: "3.0.0",
          force_update: false,
          update_url: "https://play.google.com/store/apps/details?id=com.prov",
        },
      ];
      mockGetSupabaseAdmin.mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn().mockResolvedValue({ data: rows, error: null }),
        })),
      });

      const { GET } = await import("../route");
      const res = await GET(new NextRequest("http://localhost/api/admin/app-version"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.error).toBeNull();
      expect(body.data.customer.ios.min_version).toBe("1.2.0");
      expect(body.data.customer.android.force_update).toBe(true);
      expect(body.data.provider.ios.min_version).toBe("3.0.0");
      expect(body.data.codebase_versions.customer).toBe(codebaseVersions.customer);
      expect(body.data.codebase_versions.provider).toBe(codebaseVersions.provider);
    });

    it("returns defaults when select errors (e.g. missing table)", async () => {
      mockGetSupabaseAdmin.mockReturnValue({
        from: vi.fn(() => ({
          select: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "relation does not exist" },
          }),
        })),
      });

      const { GET } = await import("../route");
      const res = await GET(new NextRequest("http://localhost/api/admin/app-version"));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.customer.ios.min_version).toBe("1.0.0");
      expect(body.data.provider.android.update_url).toContain("play.google.com");
    });

    it("returns 403 when requireAdminSection throws", async () => {
      mockRequireAdminSection.mockRejectedValue(
        new Error("Insufficient permissions: access to section 'platform_config' required")
      );
      mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn() });

      const { GET } = await import("../route");
      const res = await GET(new NextRequest("http://localhost/api/admin/app-version"));

      expect(res.status).toBe(403);
    });
  });

  describe("PATCH", () => {
    it("returns 200 after batch upsert and re-read", async () => {
      const updatedRows = [
        {
          app: "customer",
          platform: "ios",
          min_version: validBody.customer.ios.min_version,
          latest_version: validBody.customer.ios.latest_version,
          force_update: validBody.customer.ios.force_update,
          update_url: validBody.customer.ios.update_url,
        },
        {
          app: "customer",
          platform: "android",
          min_version: validBody.customer.android.min_version,
          latest_version: validBody.customer.android.latest_version,
          force_update: validBody.customer.android.force_update,
          update_url: validBody.customer.android.update_url,
        },
        {
          app: "provider",
          platform: "ios",
          min_version: validBody.provider.ios.min_version,
          latest_version: validBody.provider.ios.latest_version,
          force_update: validBody.provider.ios.force_update,
          update_url: validBody.provider.ios.update_url,
        },
        {
          app: "provider",
          platform: "android",
          min_version: validBody.provider.android.min_version,
          latest_version: validBody.provider.android.latest_version,
          force_update: validBody.provider.android.force_update,
          update_url: validBody.provider.android.update_url,
        },
      ];
      mockGetSupabaseAdmin.mockReturnValue({
        from: vi
          .fn()
          .mockReturnValueOnce({
            upsert: vi.fn().mockResolvedValue({ error: null }),
          })
          .mockReturnValueOnce({
            select: vi.fn().mockResolvedValue({ data: updatedRows, error: null }),
          }),
      });

      const { PATCH } = await import("../route");
      const req = new NextRequest("http://localhost/api/admin/app-version", {
        method: "PATCH",
        body: JSON.stringify(validBody),
        headers: { "Content-Type": "application/json" },
      });
      const res = await PATCH(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.error).toBeNull();
      expect(body.data.customer.ios.min_version).toBe("1.0.0");
      expect(body.data.provider.ios.min_version).toBe("1.0.0");
      expect(body.data.codebase_versions.customer).toBe(codebaseVersions.customer);
    });

    it("ignores codebase_versions in PATCH body", async () => {
      const updatedRows = [
        {
          app: "customer",
          platform: "ios",
          min_version: validBody.customer.ios.min_version,
          latest_version: validBody.customer.ios.latest_version,
          force_update: validBody.customer.ios.force_update,
          update_url: validBody.customer.ios.update_url,
        },
        {
          app: "customer",
          platform: "android",
          min_version: validBody.customer.android.min_version,
          latest_version: validBody.customer.android.latest_version,
          force_update: validBody.customer.android.force_update,
          update_url: validBody.customer.android.update_url,
        },
        {
          app: "provider",
          platform: "ios",
          min_version: validBody.provider.ios.min_version,
          latest_version: validBody.provider.ios.latest_version,
          force_update: validBody.provider.ios.force_update,
          update_url: validBody.provider.ios.update_url,
        },
        {
          app: "provider",
          platform: "android",
          min_version: validBody.provider.android.min_version,
          latest_version: validBody.provider.android.latest_version,
          force_update: validBody.provider.android.force_update,
          update_url: validBody.provider.android.update_url,
        },
      ];
      mockGetSupabaseAdmin.mockReturnValue({
        from: vi
          .fn()
          .mockReturnValueOnce({
            upsert: vi.fn().mockResolvedValue({ error: null }),
          })
          .mockReturnValueOnce({
            select: vi.fn().mockResolvedValue({ data: updatedRows, error: null }),
          }),
      });

      const { PATCH } = await import("../route");
      const req = new NextRequest("http://localhost/api/admin/app-version", {
        method: "PATCH",
        body: JSON.stringify({
          ...validBody,
          codebase_versions: { customer: "9.9.9", provider: "9.9.9" },
        }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await PATCH(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.codebase_versions.customer).toBe(codebaseVersions.customer);
    });

    it("returns 400 when body has invalid update_url", async () => {
      mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn() });

      const { PATCH } = await import("../route");
      const bad = {
        ...validBody,
        customer: {
          ...validBody.customer,
          ios: { ...validBody.customer.ios, update_url: "not-a-url" },
        },
      };
      const req = new NextRequest("http://localhost/api/admin/app-version", {
        method: "PATCH",
        body: JSON.stringify(bad),
        headers: { "Content-Type": "application/json" },
      });
      const res = await PATCH(req);

      expect(res.status).toBe(400);
    });

    it("returns 400 when latest version is older than minimum version", async () => {
      mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn() });

      const { PATCH } = await import("../route");
      const bad = {
        ...validBody,
        customer: {
          ...validBody.customer,
          ios: { ...validBody.customer.ios, min_version: "2.0.0", latest_version: "1.9.9" },
        },
      };
      const req = new NextRequest("http://localhost/api/admin/app-version", {
        method: "PATCH",
        body: JSON.stringify(bad),
        headers: { "Content-Type": "application/json" },
      });
      const res = await PATCH(req);

      expect(res.status).toBe(400);
    });

    it("returns 400 when version is not semantic", async () => {
      mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn() });

      const { PATCH } = await import("../route");
      const bad = {
        ...validBody,
        provider: {
          ...validBody.provider,
          android: { ...validBody.provider.android, latest_version: "2026.05" },
        },
      };
      const req = new NextRequest("http://localhost/api/admin/app-version", {
        method: "PATCH",
        body: JSON.stringify(bad),
        headers: { "Content-Type": "application/json" },
      });
      const res = await PATCH(req);

      expect(res.status).toBe(400);
    });

    it("returns 400 when latest version exceeds codebase version", async () => {
      mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn() });

      const { PATCH } = await import("../route");
      const bad = {
        ...validBody,
        customer: {
          ...validBody.customer,
          ios: { ...validBody.customer.ios, latest_version: "99.99.99" },
        },
      };
      const req = new NextRequest("http://localhost/api/admin/app-version", {
        method: "PATCH",
        body: JSON.stringify(bad),
        headers: { "Content-Type": "application/json" },
      });
      const res = await PATCH(req);

      expect(res.status).toBe(400);
    });

    it("returns 400 when provider block is missing", async () => {
      mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn() });

      const { PATCH } = await import("../route");
      const req = new NextRequest("http://localhost/api/admin/app-version", {
        method: "PATCH",
        body: JSON.stringify({ customer: validBody.customer }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await PATCH(req);

      expect(res.status).toBe(400);
    });
  });
});
