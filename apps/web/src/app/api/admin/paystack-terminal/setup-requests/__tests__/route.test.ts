import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requireAdminSectionMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireAdminSection: (...args: unknown[]) => requireAdminSectionMock(...args),
  getOffsetPaginationParams: () => ({ limit: 50, offset: 0 }),
  handleApiError: (error: Error) =>
    new Response(JSON.stringify({ error: { message: error.message } }), { status: 500 }),
  successResponse: (data: unknown) =>
    new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } }),
  errorResponse: (message: string, code: string, status: number) =>
    new Response(JSON.stringify({ error: { message, code } }), { status }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

vi.mock("@/lib/payments/paystack-virtual-terminal", () => ({
  createPaystackVirtualTerminal: vi.fn(),
}));

vi.mock("@/lib/payments/paystack-terminal-assets", () => ({
  buildPaystackTerminalPaymentUrl: vi.fn(),
  buildTerminalBusinessSnapshot: vi.fn(),
  computePaystackTerminalAssetStatus: vi.fn(),
}));

describe("GET /api/admin/paystack-terminal/setup-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const resolved = { data: [], error: null, count: 0 };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "range"]) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }
    chain.then = (onFulfilled: (value: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled);
    fromMock.mockReturnValue(chain);
  });

  it("requires finance admin section", async () => {
    requireAdminSectionMock.mockRejectedValueOnce(new Error("Forbidden"));
    const { GET } = await import("../route");
    const request = new NextRequest("http://localhost/api/admin/paystack-terminal/setup-requests");
    const response = await GET(request);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(requireAdminSectionMock).toHaveBeenCalledWith("finance", request);
  });

  it("returns setup requests for finance admin", async () => {
    requireAdminSectionMock.mockResolvedValueOnce({ user: { id: "admin-1", role: "admin_finance" } });
    const { GET } = await import("../route");
    const request = new NextRequest("http://localhost/api/admin/paystack-terminal/setup-requests?status=requested");
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
  });
});
