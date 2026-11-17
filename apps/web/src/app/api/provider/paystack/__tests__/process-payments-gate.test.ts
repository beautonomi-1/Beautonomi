import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockGetSupabaseServer = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
  requireAnyPermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => {
    throw new Error("admin client should not load");
  },
}));

describe("Paystack terminal routes require process_payments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: false,
      response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
    });
  });

  it("does not list terminal payments from the mobile inbox", async () => {
    const { listPaystackTerminalPaymentsMobile } = await import(
      "@/lib/payments/paystack-terminal-provider-mobile-api"
    );
    const res = await listPaystackTerminalPaymentsMobile(
      new NextRequest("http://localhost/api/provider/payments?paystack_terminal=1"),
    );
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not load terminal details", async () => {
    const { loadPaystackTerminalMobileDetail } = await import(
      "@/lib/payments/paystack-terminal-provider-mobile-api"
    );
    const res = await loadPaystackTerminalMobileDetail(
      new NextRequest("http://localhost/api/provider/settings/payments?paystack_terminal_detail=1"),
    );
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not reconcile payments from the mobile fallback", async () => {
    const { reconcilePaystackTerminalPaymentsMobile } = await import(
      "@/lib/payments/paystack-terminal-provider-mobile-api"
    );
    const res = await reconcilePaystackTerminalPaymentsMobile(
      new NextRequest("http://localhost/api/provider/paystack/terminal-payments/reconcile", { method: "POST" }),
    );
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not list terminals on the web route", async () => {
    const { GET } = await import("../virtual-terminals/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/paystack/virtual-terminals"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not list terminal payments on the web route", async () => {
    const { GET } = await import("../terminal-payments/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/paystack/terminal-payments"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not reconcile on the web route", async () => {
    const { POST } = await import("../terminal-payments/reconcile/route");
    const res = await POST(
      new NextRequest("http://localhost/api/provider/paystack/terminal-payments/reconcile", { method: "POST" }),
    );
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });
});
