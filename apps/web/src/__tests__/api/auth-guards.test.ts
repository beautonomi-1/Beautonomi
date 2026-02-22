/**
 * Auth-guard tests for protected API routes.
 *
 * These tests mock the `requireRoleInApi` helper (from
 * `@/lib/supabase/api-helpers`) and verify that each route category rejects
 * unauthenticated / under-privileged callers with the expected error.
 *
 * The approach:
 *  1. Mock `requireRoleInApi` to throw when the caller lacks the required role.
 *  2. Import the route handler.
 *  3. Assert the handler surfaces a 401 / 403 when the guard throws.
 *
 * Because Next.js App Router route files are just modules that export HTTP
 * method functions, we can import and invoke them directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockNextRequest,
  createMockSupabaseClient,
  MOCK_USERS,
  type MockUser,
} from "../helpers/mock-supabase";

// ---------------------------------------------------------------------------
// Mock modules – these must be hoisted above any dynamic imports.
// ---------------------------------------------------------------------------

// We mock the requireRoleInApi function which is used by all protected routes.
const mockRequireRoleInApi = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async () => {
  return {
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    successResponse: (data: unknown, status = 200) => {
      return new Response(JSON.stringify({ data, error: null }), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
    handleApiError: (
      _err: unknown,
      message = "Error",
      code = "ERROR",
      status = 500
    ) => {
      return new Response(
        JSON.stringify({ data: null, error: { message, code } }),
        { status, headers: { "content-type": "application/json" } }
      );
    },
    errorResponse: (message: string, code = "ERROR", status = 400) => {
      return new Response(
        JSON.stringify({ data: null, error: { message, code } }),
        { status, headers: { "content-type": "application/json" } }
      );
    },
    getPaginationParams: () => ({ page: 1, limit: 20, offset: 0 }),
    createPaginatedResponse: (data: unknown) =>
      new Response(JSON.stringify({ data, error: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn().mockResolvedValue(createMockSupabaseClient()),
  createSupabaseClientFromToken: vi
    .fn()
    .mockReturnValue(createMockSupabaseClient()),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn().mockReturnValue(createMockSupabaseClient()),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate an unauthenticated call – requireRoleInApi throws. */
function rejectAuth(message = "Authentication required") {
  mockRequireRoleInApi.mockRejectedValue(new Error(message));
}

/** Simulate a call with insufficient role. */
function rejectRole(message = "Insufficient permissions") {
  mockRequireRoleInApi.mockRejectedValue(new Error(message));
}

/** Simulate a successful auth returning the given user. */
function allowAuth(user: MockUser) {
  mockRequireRoleInApi.mockResolvedValue({ user });
}

/** Assert a response is an auth error (401 or 403 or 500 with auth message). */
async function expectAuthError(response: Response) {
  expect(response.status).toBeGreaterThanOrEqual(400);
  const body = await response.json();
  expect(body.error).toBeTruthy();
  expect(body.data).toBeNull();
}

// ---------------------------------------------------------------------------
// Helpers to parse JSON from a Response robustly
// ---------------------------------------------------------------------------

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return { data: null, error: { message: "Non-JSON response" } };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Paystack routes require authentication
// ═══════════════════════════════════════════════════════════════════════════

describe("Paystack routes – authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST /api/paystack/initialize rejects unauthenticated requests", async () => {
    rejectAuth();

    // The route handler catches the thrown error and returns an error response
    const { POST } = await import(
      "@/app/api/paystack/initialize/route"
    );

    const req = createMockNextRequest({
      method: "POST",
      url: "http://localhost:3000/api/paystack/initialize",
      body: { email: "test@example.com", amount: 5000, metadata: { bookingData: "{}" } },
    });

    const res = await POST(req as any);
    await expectAuthError(res);
  });

  it("POST /api/paystack/initialize accepts authenticated customer", async () => {
    allowAuth(MOCK_USERS.customer);

    const { POST } = await import(
      "@/app/api/paystack/initialize/route"
    );

    const req = createMockNextRequest({
      method: "POST",
      url: "http://localhost:3000/api/paystack/initialize",
      body: { email: "test@example.com", amount: 5000, metadata: { bookingData: "{}" } },
    });

    // This will fail at the Paystack API call level (env var missing),
    // but NOT at the auth level — which is what we're testing.
    const res = await POST(req as any);
    // Even though it errors, it should not be a 401
    const body = await safeJson(res);
    if (res.status >= 400) {
      // The error should be about Paystack config, not auth
      const errMsg = (body.error as Record<string, unknown>)?.message as string ?? "";
      expect(errMsg).not.toContain("Authentication required");
    }
  });

  it("GET /api/paystack/verify rejects unauthenticated requests", async () => {
    rejectAuth();

    const { GET } = await import("@/app/api/paystack/verify/route");

    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/paystack/verify",
      searchParams: { reference: "ref_12345" },
    });

    const res = await GET(req as any);
    await expectAuthError(res);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Notification routes require authentication
// ═══════════════════════════════════════════════════════════════════════════

describe("Notification send routes – authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Mock OneSignal calls so they don't actually fire
  vi.mock("@/lib/notifications/onesignal", () => ({
    sendToUser: vi.fn().mockResolvedValue({ success: true }),
    sendTemplateNotification: vi.fn().mockResolvedValue({ success: true }),
    getNotificationTemplate: vi.fn().mockResolvedValue(null),
  }));

  it("POST /api/notifications/send-email rejects unauthenticated requests", async () => {
    rejectAuth();

    const { POST } = await import(
      "@/app/api/notifications/send-email/route"
    );

    const req = createMockNextRequest({
      method: "POST",
      url: "http://localhost:3000/api/notifications/send-email",
      body: { to: "user@example.com", subject: "Test", body: "Hello" },
    });

    const res = await POST(req as any);
    await expectAuthError(res);
  });

  it("POST /api/notifications/send-email rejects customer role", async () => {
    rejectRole("Insufficient permissions: requires one of superadmin, provider_owner");

    const { POST } = await import(
      "@/app/api/notifications/send-email/route"
    );

    const req = createMockNextRequest({
      method: "POST",
      url: "http://localhost:3000/api/notifications/send-email",
      body: { to: "user@example.com", subject: "Test", body: "Hello" },
    });

    const res = await POST(req as any);
    await expectAuthError(res);
  });

  it("POST /api/notifications/send-sms rejects unauthenticated requests", async () => {
    rejectAuth();

    const { POST } = await import(
      "@/app/api/notifications/send-sms/route"
    );

    const req = createMockNextRequest({
      method: "POST",
      url: "http://localhost:3000/api/notifications/send-sms",
      body: { to: "+27123456789", message: "Test SMS" },
    });

    const res = await POST(req as any);
    await expectAuthError(res);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Admin routes require superadmin role
// ═══════════════════════════════════════════════════════════════════════════

describe("Admin routes – superadmin requirement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/admin/users rejects unauthenticated requests", async () => {
    rejectAuth();

    const { GET } = await import("@/app/api/admin/users/route");

    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/users",
    });

    const res = await GET(req as any);
    await expectAuthError(res);
  });

  it("GET /api/admin/users rejects non-superadmin roles", async () => {
    rejectRole("Insufficient permissions: requires one of superadmin");

    const { GET } = await import("@/app/api/admin/users/route");

    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/users",
    });

    const res = await GET(req as any);
    await expectAuthError(res);
  });

  it("GET /api/admin/users allows superadmin", async () => {
    allowAuth(MOCK_USERS.superadmin);

    const { GET } = await import("@/app/api/admin/users/route");

    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/users",
    });

    const res = await GET(req as any);
    // Should succeed (200) or at least not be an auth error
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("GET /api/admin/bookings rejects unauthenticated requests", async () => {
    rejectAuth();

    const { GET } = await import("@/app/api/admin/bookings/route");

    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/bookings",
    });

    const res = await GET(req as any);
    await expectAuthError(res);
  });

  it("GET /api/admin/audit-logs rejects non-superadmin", async () => {
    rejectRole("Insufficient permissions: requires one of superadmin");

    const { GET } = await import("@/app/api/admin/audit-logs/route");

    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/audit-logs",
    });

    const res = await GET(req as any);
    await expectAuthError(res);
  });

  it("GET /api/admin/platform-fees rejects customer role", async () => {
    rejectRole("Insufficient permissions: requires one of superadmin");

    const mod = await import("@/app/api/admin/platform-fees/route");
    const GET = (mod as Record<string, Function>).GET;

    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/platform-fees",
    });

    const res = await GET(req as any);
    await expectAuthError(res);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. requireRoleInApi contract tests (unit-level)
// ═══════════════════════════════════════════════════════════════════════════

describe("requireRoleInApi – contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is called with the expected role array for admin routes", async () => {
    allowAuth(MOCK_USERS.superadmin);

    const { GET } = await import("@/app/api/admin/users/route");

    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/users",
    });

    await GET(req as any);

    expect(mockRequireRoleInApi).toHaveBeenCalled();
    const firstArg = mockRequireRoleInApi.mock.calls[0]?.[0];

    // Admin user routes should require superadmin
    if (Array.isArray(firstArg)) {
      expect(firstArg).toContain("superadmin");
    } else {
      expect(firstArg).toBe("superadmin");
    }
  });

  it("is called with multi-role array for notification routes", async () => {
    allowAuth(MOCK_USERS.provider_owner);

    const { POST } = await import(
      "@/app/api/notifications/send-email/route"
    );

    const req = createMockNextRequest({
      method: "POST",
      url: "http://localhost:3000/api/notifications/send-email",
      body: { to: "x@y.com", subject: "Hi", body: "test" },
    });

    await POST(req as any);

    expect(mockRequireRoleInApi).toHaveBeenCalled();
    const firstArg = mockRequireRoleInApi.mock.calls[0]?.[0];

    if (Array.isArray(firstArg)) {
      expect(firstArg).toContain("superadmin");
      expect(firstArg).toContain("provider_owner");
    }
  });
});
