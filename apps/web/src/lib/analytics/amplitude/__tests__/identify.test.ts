/**
 * Schema contract test: identify output must only contain allowed keys and no PII.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  identifyUser,
  AMPLITUDE_USER_PROPERTY_KEYS,
  FORBIDDEN_PII_KEYS,
  type UserProperties,
} from "../identify";

const ALLOWED_SET = new Set<string>(AMPLITUDE_USER_PROPERTY_KEYS as unknown as string[]);

function createMockSupabase() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null }),
  };
  const from = vi.fn(() => chain);
  return { from, chain };
}

const mockGetSupabaseServer = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: () => mockGetSupabaseServer(),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  getProviderIdForUser: vi.fn().mockResolvedValue(null),
}));

describe("identify schema contract", () => {
  beforeEach(() => {
    mockGetSupabaseServer.mockResolvedValue(createMockSupabase());
  });

  it("returns only allowed property keys", async () => {
    const result = await identifyUser("user-1", "customer", {
      email: "test@example.com",
      phone: "+1234567890",
      full_name: "Test User",
    });

    const keys = Object.keys(result);
    for (const key of keys) {
      expect(ALLOWED_SET.has(key), `Unexpected key: ${key}`).toBe(true);
    }
  });

  it("never returns forbidden PII keys", async () => {
    const result = await identifyUser("user-1", "customer", {
      email: "test@example.com",
      phone: "+1234567890",
      full_name: "Test User",
    });

    for (const forbidden of FORBIDDEN_PII_KEYS) {
      expect((result as Record<string, unknown>)[forbidden], `PII key must be absent: ${forbidden}`).toBeUndefined();
    }
  });

  it("sets has_email, has_phone, has_name instead of raw PII", async () => {
    const result = await identifyUser("user-1", "customer", {
      email: "a@b.com",
      phone: "123",
      full_name: "Name",
    });

    expect(result.has_email).toBe(true);
    expect(result.has_phone).toBe(true);
    expect(result.has_name).toBe(true);
    expect((result as Record<string, unknown>).email).toBeUndefined();
    expect((result as Record<string, unknown>).phone).toBeUndefined();
    expect((result as Record<string, unknown>).full_name).toBeUndefined();
  });

  it("returns object that satisfies UserProperties type (no extra keys)", async () => {
    const result: UserProperties = await identifyUser("user-1", "customer");
    expect(result.user_id).toBe("user-1");
    expect(result.role).toBe("customer");
    expect(typeof result.device_type).toBe("string");
  });

  it("includes active tenant context when provided (allowed keys only)", async () => {
    const result = await identifyUser(
      "user-1",
      "customer",
      undefined,
      { id: "tenant-uuid-1", slug: "za" },
    );
    expect(result.active_tenant_id).toBe("tenant-uuid-1");
    expect(result.active_tenant_slug).toBe("za");
    for (const key of Object.keys(result)) {
      expect(ALLOWED_SET.has(key), `Unexpected key: ${key}`).toBe(true);
    }
  });
});
