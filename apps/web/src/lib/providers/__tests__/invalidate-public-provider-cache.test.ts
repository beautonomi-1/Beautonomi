import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

import { revalidateTag, revalidatePath } from "next/cache";
import { invalidatePublicProviderCache } from "@/lib/providers/invalidate-public-provider-cache";

describe("invalidatePublicProviderCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("always emits global tags and root path", () => {
    invalidatePublicProviderCache();

    expect(revalidateTag).toHaveBeenCalledWith("public-providers", "default");
    expect(revalidateTag).toHaveBeenCalledWith("public-home", "default");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("emits per-tenant tags in addition to global tags when tenantId is provided", () => {
    invalidatePublicProviderCache("tenant-xyz");

    const tagCalls = vi.mocked(revalidateTag).mock.calls.map((c) => c[0]);

    expect(tagCalls).toContain("public-providers");
    expect(tagCalls).toContain("public-home");
    expect(tagCalls).toContain("public-providers-tenant-xyz");
    expect(tagCalls).toContain("public-home-tenant-xyz");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("does NOT emit per-tenant tags when tenantId is omitted", () => {
    invalidatePublicProviderCache();

    const tagCalls = vi.mocked(revalidateTag).mock.calls.map((c) => c[0]);

    expect(tagCalls).toHaveLength(2);
    expect(tagCalls.every((t) => t === "public-providers" || t === "public-home")).toBe(true);
  });

  it("does NOT emit per-tenant tags when tenantId is null", () => {
    invalidatePublicProviderCache(null);

    const tagCalls = vi.mocked(revalidateTag).mock.calls.map((c) => c[0]);

    expect(tagCalls).toHaveLength(2);
    expect(tagCalls.some((t) => t.includes("null"))).toBe(false);
  });

  it("does NOT emit per-tenant tags when tenantId is empty string", () => {
    invalidatePublicProviderCache("");

    const tagCalls = vi.mocked(revalidateTag).mock.calls.map((c) => c[0]);

    // empty string is falsy so per-tenant branch is skipped
    expect(tagCalls).toHaveLength(2);
  });

  it("isolates per-tenant invalidation between different tenants", () => {
    invalidatePublicProviderCache("tenant-a");
    vi.clearAllMocks();
    invalidatePublicProviderCache("tenant-b");

    const tagCalls = vi.mocked(revalidateTag).mock.calls.map((c) => c[0]);

    expect(tagCalls).toContain("public-providers-tenant-b");
    expect(tagCalls).toContain("public-home-tenant-b");
    expect(tagCalls).not.toContain("public-providers-tenant-a");
    expect(tagCalls).not.toContain("public-home-tenant-a");
  });

  it("swallows revalidateTag errors without throwing", () => {
    vi.mocked(revalidateTag).mockImplementation(() => {
      throw new Error("Next.js cache not available");
    });

    expect(() => invalidatePublicProviderCache("tenant-xyz")).not.toThrow();
  });
});
